import { SplitLayout } from '../features/layout/SplitLayout';
import { Toolbar } from '../features/toolbar/Toolbar';
import styles from './App.module.css';

export function App() {
  return (
    <div className={styles.app}>
      <Toolbar />
      <main className={styles.main}>
        <SplitLayout />
      </main>
    </div>
  );
}
