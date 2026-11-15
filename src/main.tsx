import { render } from 'preact';
import { App } from './App';
// Fonts of the "Сумерки" theme (Latin + Cyrillic files are loaded only when the theme uses them).
import '@fontsource-variable/cormorant-garamond/wght.css';
import '@fontsource-variable/alegreya/wght.css';
import '@fontsource-variable/alegreya/wght-italic.css';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/400-italic.css';
import '@fontsource/alegreya-sans/500.css';
import '@fontsource/alegreya-sans/700.css';
import './styles.css';

render(<App />, document.getElementById('app')!);
