import { registerRootComponent } from 'expo';

// The background task must be defined before the root component registers.
import './src/location/backgroundTask';
import App from './App';

registerRootComponent(App);
