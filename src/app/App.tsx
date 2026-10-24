import { SplitLayout } from '../features/layout/SplitLayout';
import { Toolbar } from '../features/toolbar/Toolbar';
import styles from './App.module.css';

const REPO = 'https://github.com/engineeringwitharavind/orderflow-panel';

export function App() {
  return (
    <div className={styles.app}>
      {/* For a cold visitor: what this is, and where to read more. */}
      <header className={styles.intro}>
        <p className={styles.what}>
          <strong>Orderflow Panel</strong>
          <span>
            {' '}
            · a live order book and trade tape on Binance&rsquo;s public feed, built to show real-time React
            performance.
          </span>
        </p>
        <nav className={styles.links} aria-label="About this project">
          <a href={REPO} target="_blank" rel="noreferrer">
            Source
          </a>
          <a href={`${REPO}/blob/main/BUILD_LOG.md`} target="_blank" rel="noreferrer">
            How it was built
          </a>
        </nav>
      </header>
      <Toolbar />
      <main className={styles.main}>
        <SplitLayout />
      </main>
    </div>
  );
}
