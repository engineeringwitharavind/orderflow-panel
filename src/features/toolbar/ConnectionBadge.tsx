import { useAppSelector } from '../../app/hooks';
import { useRuntime } from '../../ws/runtime';
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
  const { replay } = useRuntime();
  return (
    <div className={styles.badge} role="status" aria-live="polite" data-status={status}>
      <span className={styles.dot} aria-hidden />
      {replay && status === 'open' ? `Replay · ${replay.name}${replay.speed !== 1 ? ` · ${replay.speed}×` : ''}` : LABEL[status]}
      {status === 'reconnecting' && <span className="num"> · attempt {attempt}</span>}
    </div>
  );
}
