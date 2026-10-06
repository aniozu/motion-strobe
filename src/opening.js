import {installHomeExample,restartHomeExample} from './home-examples.js';
import {installHomeIntro} from './home-intro.js';
import {initializeOpeningPreference} from './opening-preference.js';

// A small independent entry: the home never waits for analysis UI/Worker setup.
const home=document.getElementById('home');
initializeOpeningPreference(document);
if(home)installHomeIntro(home,installHomeExample(home),options=>restartHomeExample(home,options));
