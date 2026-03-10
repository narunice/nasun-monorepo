import { WALLET_STYLES } from './styles';

interface PanelHeaderProps {
  title: string;
  onClose?: () => void;
  onBack?: () => void;
  titleIcon?: React.ReactNode;
  rightExtra?: React.ReactNode;
}

export function PanelHeader({ title, onClose, onBack, titleIcon, rightExtra }: PanelHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2 min-w-0">
        {onBack && (
          <button
            onClick={onBack}
            className={WALLET_STYLES.backButton}
            aria-label="Back"
          >
            <svg className={WALLET_STYLES.backIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <h3 className={`${WALLET_STYLES.panelTitle} ${titleIcon ? 'flex items-center gap-2' : ''}`}>
          {titleIcon}
          {title}
        </h3>
      </div>
      <div className="flex items-center gap-2">
        {rightExtra}
        {onClose && (
          <button onClick={onClose} className={WALLET_STYLES.closeButton}>
            <svg className={WALLET_STYLES.closeIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
