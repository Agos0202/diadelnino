import { render, screen } from '@testing-library/react';
import App from './App';

test('renders children day title', () => {
  render(<App />);
  const titleElement = screen.getByRole('heading', { name: /Evento.*Día del Niño/i });
  expect(titleElement).toBeInTheDocument();
});
