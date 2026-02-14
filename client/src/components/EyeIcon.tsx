interface EyeIconProps {
  open: boolean;
  className?: string;
}

export default function EyeIcon({ open, className }: EyeIconProps) {
  if (open) {
    return (
      <svg
        className={className}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M2 12C3.8 8.4 7.4 6 12 6C16.6 6 20.2 8.4 22 12C20.2 15.6 16.6 18 12 18C7.4 18 3.8 15.6 2 12Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M2 12C3.8 8.4 7.4 6 12 6C16.6 6 20.2 8.4 22 12C20.2 15.6 16.6 18 12 18C7.4 18 3.8 15.6 2 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4 4L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
