var app = (function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            callbacks.slice().forEach(fn => fn(event));
        }
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    /* src/components/ProgressBar.svelte generated by Svelte v3.23.0 */

    function create_fragment(ctx) {
    	let div1;
    	let div0;
    	let span;

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");
    			span = element("span");
    			span.textContent = "%";
    			attr(span, "class", "sr-only svelte-mopq0");
    			attr(div0, "class", "progress-bar svelte-mopq0");
    			set_style(div0, "width", /*progressValue*/ ctx[0] + "%");
    			attr(div1, "class", "progressbar svelte-mopq0");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, div0);
    			append(div0, span);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*progressValue*/ 1) {
    				set_style(div0, "width", /*progressValue*/ ctx[0] + "%");
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div1);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let { progressValue = 0 } = $$props;

    	$$self.$set = $$props => {
    		if ("progressValue" in $$props) $$invalidate(0, progressValue = $$props.progressValue);
    	};

    	return [progressValue];
    }

    class ProgressBar extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, { progressValue: 0 });
    	}
    }

    /* src/components/Timer.svelte generated by Svelte v3.23.0 */

    function create_fragment$1(ctx) {
    	let div;
    	let p;
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let button;
    	let t4;
    	let current;
    	let mounted;
    	let dispose;

    	const progressbar = new ProgressBar({
    			props: { progressValue: /*progressValue*/ ctx[1] }
    		});

    	return {
    		c() {
    			div = element("div");
    			p = element("p");
    			t0 = text("Seconds left: ");
    			t1 = text(/*timeLeft*/ ctx[0]);
    			t2 = space();
    			create_component(progressbar.$$.fragment);
    			t3 = space();
    			button = element("button");
    			t4 = text("Start");
    			attr(p, "class", "svelte-1ncyqpa");
    			button.disabled = /*disabled*/ ctx[2];
    			attr(button, "class", "btn svelte-1ncyqpa");
    			attr(div, "class", "timer svelte-1ncyqpa");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, p);
    			append(p, t0);
    			append(p, t1);
    			append(div, t2);
    			mount_component(progressbar, div, null);
    			append(div, t3);
    			append(div, button);
    			append(button, t4);
    			current = true;

    			if (!mounted) {
    				dispose = listen(button, "click", /*click_handler*/ ctx[3]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (!current || dirty & /*timeLeft*/ 1) set_data(t1, /*timeLeft*/ ctx[0]);
    			const progressbar_changes = {};
    			if (dirty & /*progressValue*/ 2) progressbar_changes.progressValue = /*progressValue*/ ctx[1];
    			progressbar.$set(progressbar_changes);

    			if (!current || dirty & /*disabled*/ 4) {
    				button.disabled = /*disabled*/ ctx[2];
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(progressbar.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(progressbar.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_component(progressbar);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { timeLeft = 20 } = $$props;
    	let { progressValue = 0 } = $$props;
    	let { disabled = false } = $$props;

    	function click_handler(event) {
    		bubble($$self, event);
    	}

    	$$self.$set = $$props => {
    		if ("timeLeft" in $$props) $$invalidate(0, timeLeft = $$props.timeLeft);
    		if ("progressValue" in $$props) $$invalidate(1, progressValue = $$props.progressValue);
    		if ("disabled" in $$props) $$invalidate(2, disabled = $$props.disabled);
    	};

    	return [timeLeft, progressValue, disabled, click_handler];
    }

    class Timer extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {
    			timeLeft: 0,
    			progressValue: 1,
    			disabled: 2
    		});
    	}
    }

    /* src/components/HowTo.svelte generated by Svelte v3.23.0 */

    function create_fragment$2(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			div.innerHTML = `<img src="/assets/images/how_to_handwash_lge.gif" alt="image showed how to wash hand" class="svelte-10t3lmq">`;
    			attr(div, "class", "img-box");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    class HowTo extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, null, create_fragment$2, safe_not_equal, {});
    	}
    }

    /* src/App.svelte generated by Svelte v3.23.0 */

    function create_fragment$3(ctx) {
    	let div1;
    	let div0;
    	let h1;
    	let t1;
    	let t2;
    	let current;

    	const timer = new Timer({
    			props: {
    				disabled: /*disabled*/ ctx[2],
    				progressValue: /*progressValue*/ ctx[1],
    				timeLeft: /*timeLeft*/ ctx[0]
    			}
    		});

    	timer.$on("click", /*handleClick*/ ctx[3]);
    	const howto = new HowTo({});

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");
    			h1 = element("h1");
    			h1.textContent = "Hand Washing App";
    			t1 = space();
    			create_component(timer.$$.fragment);
    			t2 = space();
    			create_component(howto.$$.fragment);
    			attr(h1, "class", "main-title svelte-i0j01p");
    			attr(div0, "bp", "4 offset-5");
    			attr(div0, "class", "main-content svelte-i0j01p");
    			attr(div1, "bp", "grid text-center");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, div0);
    			append(div0, h1);
    			append(div0, t1);
    			mount_component(timer, div0, null);
    			append(div0, t2);
    			mount_component(howto, div0, null);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const timer_changes = {};
    			if (dirty & /*disabled*/ 4) timer_changes.disabled = /*disabled*/ ctx[2];
    			if (dirty & /*progressValue*/ 2) timer_changes.progressValue = /*progressValue*/ ctx[1];
    			if (dirty & /*timeLeft*/ 1) timer_changes.timeLeft = /*timeLeft*/ ctx[0];
    			timer.$set(timer_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(timer.$$.fragment, local);
    			transition_in(howto.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(timer.$$.fragment, local);
    			transition_out(howto.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			destroy_component(timer);
    			destroy_component(howto);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let timeLeft = 3;
    	let progressValue = 0;
    	let increment = 100 / timeLeft;
    	let disabled = false;
    	let audio = new Audio("assets/musics/345086__metrostock99__oh-yeah-low-4.wav");

    	function resetProgress() {
    		$$invalidate(0, timeLeft = 20);
    		$$invalidate(1, progressValue = 0);
    		$$invalidate(2, disabled = false);
    	}

    	function inProgress() {
    		$$invalidate(2, disabled = true);
    	}

    	function handleClick() {
    		inProgress();

    		let timer = setInterval(
    			() => {
    				$$invalidate(1, progressValue += increment);
    				$$invalidate(0, timeLeft--, timeLeft);

    				if (timeLeft == 0) {
    					clearInterval(timer);
    					audio.play();

    					setTimeout(
    						() => {
    							resetProgress();
    						},
    						1000
    					);
    				}
    			},
    			1000
    		);
    	}

    	return [timeLeft, progressValue, disabled, handleClick];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$3, safe_not_equal, {});
    	}
    }

    const app = new App({
      target: document.body,
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
