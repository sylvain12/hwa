<script>
  import ProgressBar from "./ProgressBar.svelte";

  export let timeLeft = 20;
  export let progressValue = 0;
  export let disabled = false;
</script>

<style>
  p {
    font-size: 2.5rem;
    margin-bottom: 2rem;
  }

  .btn {
    display: inline-block;
    width: 100%;
    padding: 1.5rem 2rem;
    background: #0087ff;
    border: none;
    color: #fff;
    text-transform: uppercase;
    font-weight: 600;
    font-size: 1.5rem;
    border-radius: 200px;
    letter-spacing: 2px;
    transition: all 0.2s;
    cursor: pointer;
    box-shadow: 0rem 1rem 1.8rem rgba(0, 0, 0, 0.225);
    outline: none;
  }

  .btn:hover {
    opacity: 0.8;
    box-shadow: none;
  }

  .btn:disabled {
    pointer-events: none;
    cursor: wait;
    background: #ccc;
  }

  .timer {
    margin-bottom: 4rem;
  }
</style>

<div class="timer">
  <p>Seconds left: {timeLeft}</p>
  <ProgressBar {progressValue} />
  <button {disabled} class="btn" on:click>Start</button>
</div>
