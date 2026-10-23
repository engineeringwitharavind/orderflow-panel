import { useAppSelector } from '../../app/hooks';
import styles from './ConnectionBadge.module.css';

const LABEL = {
  idle: 'Idle',
  connecting: 'Connecting',
  open: 'Live',
  reconnecting: 'Reconnecting',
  offline: 'Offline',
} as const;

export function ConnectionBadge() {
  const status = useAppSelector((s) => s.connection.status);
  const attempt = useAppSelector((s) => s.connection.attempt);
  return (
    <div className={styles.badge} role="status" aria-live="polite" data-status={status}>
      <span className={styles.dot} aria-hidden />
      {LABEL[status]}
      {status === 'reconnecting' && <span className="num"> · attempt {attempt}</span>}
    </div>
  );
}
