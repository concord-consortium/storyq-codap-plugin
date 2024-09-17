import React from 'react';
import { render, screen } from '@testing-library/react';
import Storyq from './components/storyq';

it('renders without crashing', async () => {
  render(<Storyq />)
  expect(await screen.findByText("Welcome to StoryQ!")).toBeInTheDocument()
});
