import { BrowserRouter, Routes, Route } from 'react-router-dom';
import DagBackground from './components/DagBackground';
import Explorer from './pages/Explorer';
import CovenantInteractive from './pages/CovenantInteractive';

export default function App() {
  return (
    <BrowserRouter>
      {/* DAG canvas sits behind everything */}
      <DagBackground />

      {/* Foreground content */}
      <div className="relative z-10 min-h-screen">
        <Routes>
          <Route path="/" element={<Explorer />} />
          <Route path="/covenant/:id" element={<CovenantInteractive />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
