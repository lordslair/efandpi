interface ShareButtonProps {
  onClick: () => void;
}

export default function ShareButton({ onClick }: ShareButtonProps) {
  return (
    <button
      onClick={onClick}
      className="btn-secondary flex items-center gap-2 text-sm"
      title="Share location"
      aria-label="Share location"
    >
      <span>🔗</span>
      <span>Share</span>
    </button>
  );
}
