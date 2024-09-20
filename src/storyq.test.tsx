import React from 'react';
import { render, screen } from '@testing-library/react';
import Storyq from './components/storyq';

it('renders without crashing', async () => {
  render(<Storyq />)
  expect(screen.getByText("Welcome to StoryQ!")).toBeInTheDocument()
});
