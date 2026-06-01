import { Sun, Moon } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative p-1.5 rounded-lg border border-white/10 bg-white/[0.02] hover:border-kaspa-green/30 hover:bg-kaspa-green/[0.04] transition-all duration-200 text-gray-200 hover:text-kaspa-green"
      title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
