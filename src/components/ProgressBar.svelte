<script>
  export let progressValue = 0;
</script>

<style>
  .progressbar {
    width: 100%;
    margin-bottom: 2rem;
    border: 1px solid #ccc;
  }
  .progress-bar {
    background: green;
    height: 3rem;
    width: 100%;
  }
  .sr-only {
    display: none;
  }
</style>

<div class="progressbar">
  <div class="progress-bar" style="width: {progressValue}%;">
    <span class="sr-only">%</span>
  </div>
</div>
<!-- <progress class="progressbar" max="100" value={progressValue} /> -->
