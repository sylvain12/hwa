<script>
  import Timer from "./components/Timer.svelte";
  import HowTo from "./components/HowTo.svelte";

  let timeLeft = 3;
  let progressValue = 0;
  let increment = 100 / timeLeft;
  let disabled = false;
  let audio = new Audio(
    "assets/musics/345086__metrostock99__oh-yeah-low-4.wav"
  );

  function resetProgress() {
    timeLeft = 20;
    progressValue = 0;
    disabled = false;
  }

  function inProgress() {
    disabled = true;
  }

  function handleClick() {
    inProgress();
    let timer = setInterval(() => {
      progressValue += increment;
      timeLeft--;
      if (timeLeft == 0) {
        clearInterval(timer);
        audio.play();
        setTimeout(() => {
          resetProgress();
        }, 1000);
      }
    }, 1000);
  }
</script>

<style>
  .main-title {
    text-transform: uppercase;
    margin-bottom: 3rem;
    font-weight: 100;
  }

  .main-content {
    background: #fff;
    padding: 2rem;
    box-shadow: 0rem 1rem 1.3rem 0.5rem rgba(0, 0, 0, 0.125);
  }
</style>

<div bp="grid text-center">
  <div bp="4 offset-5" class="main-content">
    <h1 class="main-title">Hand Washing App</h1>
    <Timer {disabled} {progressValue} {timeLeft} on:click={handleClick} />
    <HowTo />
  </div>
</div>
