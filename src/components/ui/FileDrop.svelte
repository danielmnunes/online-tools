<script lang="ts">
  interface Props {
    onfile: (file: File) => void;
    disabled?: boolean;
  }
  let { onfile, disabled = false }: Props = $props();

  let dragging = $state(false);
  let inputEl: HTMLInputElement;

  function take(list: FileList | null | undefined) {
    const file = list?.[0];
    if (file) onfile(file);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    if (!disabled) take(event.dataTransfer?.files);
  }

  function onDragOver(event: DragEvent) {
    // Without preventDefault the browser navigates to the dropped file.
    event.preventDefault();
    if (!disabled) dragging = true;
  }
</script>

<div
  role="button"
  tabindex="0"
  aria-disabled={disabled}
  ondrop={onDrop}
  ondragover={onDragOver}
  ondragleave={() => (dragging = false)}
  onclick={() => !disabled && inputEl.click()}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!disabled) inputEl.click();
    }
  }}
  class="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2
         border-dashed px-4 py-8 text-center transition-colors
         focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
         {disabled ? 'cursor-not-allowed opacity-50' : ''}
         {dragging ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'}"
>
  <span class="text-sm font-medium text-fg">Drop a file here, or click to choose</span>
  <span class="text-xs text-muted">
    The file is read in your browser and never uploaded. Size is not limited by us.
  </span>
  <input
    bind:this={inputEl}
    type="file"
    class="sr-only"
    {disabled}
    onchange={(e) => {
      take(e.currentTarget.files);
      // Reset so choosing the same file twice still fires a change event.
      e.currentTarget.value = '';
    }}
  />
</div>
