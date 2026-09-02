<script lang="ts" generics="T extends string">
  interface Props {
    id: string;
    value: T;
    options: ReadonlyArray<{ value: T; label: string }>;
  }
  let { id, value = $bindable(), options }: Props = $props();
</script>

<select
  {id}
  bind:value
  class="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg
         focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
>
  {#each options as option (option.value)}
    <option value={option.value}>{option.label}</option>
  {/each}
</select>
