interface Props {
  icon: string; // Font Awesome クラス (例: "fa-plug-circle-exclamation")
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div class="empty-state">
      <div class="empty-state-icon">
        <i class={`fas ${icon}`} />
      </div>
      <h3 class="empty-state-title">{title}</h3>
      <p class="empty-state-desc">{description}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          class="mt-4 btn btn-sm btn-primary rounded-lg"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
