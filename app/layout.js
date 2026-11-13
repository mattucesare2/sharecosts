import './globals.css';
import { Shell } from '../lib/app';
export const metadata = { title: 'Sharecosts' };
export default function RootLayout({ children }) {
  return <html lang="it"><body><Shell>{children}</Shell></body></html>;
}
