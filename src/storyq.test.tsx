import React from 'react';
import ReactDOM from 'react-dom';
import Storyq from './storyq';

it('renders without crashing', () => {
  const div = document.createElement('div');
  ReactDOM.render(<Storyq />, div);
  ReactDOM.unmountComponentAtNode(div);
});
