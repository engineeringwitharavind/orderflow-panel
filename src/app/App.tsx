import { SplitLayout } from '../features/layout/SplitLayout';
import { Toolbar } from '../features/toolbar/Toolbar';
import styles from './App.module.css';

const REPO = 'https://github.com/engineeringwitharavind/orderflow-panel';
const HOME = 'https://engineeringwitharavind.com';

export function App() {
  return (
    <div className={styles.app}>
      {/* For a cold visitor: what this is, and where to read more. */}
      <header className={styles.intro}>
        <p className={styles.what}>
          <strong>Orderflow panel</strong>
          <span> · A live order book and trade tape that keeps up with a busy market</span>
        </p>
        <nav className={styles.links} aria-label="About this project">
          <a href={REPO} target="_blank" rel="noreferrer">Source</a>
          <span aria-hidden>·</span>
          <a href={`${REPO}/blob/main/BUILD_LOG.md`} target="_blank" rel="noreferrer">How it was built</a>
          <span aria-hidden>·</span>
          <a href={HOME} target="_blank" rel="noreferrer">Home</a>
        </nav>
      </header>
      <Toolbar />
      <main className={styles.main}>
        <SplitLayout />
      </main>
    </div>
  );
}
