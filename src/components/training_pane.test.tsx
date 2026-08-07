import React from "react";
import { render, screen } from "@testing-library/react";
import { trainingStore } from "../stores/training_store";
import { TrainingPane } from "./training_pane";

/**
 * A training run lives partly in memory, so a document saved mid-run reopens with a model that
 * claims to be training but has no fit loop left to continue. Step cannot advance it, and before
 * STORYQ-86 it just sat there doing nothing (after throwing, until the underlying crash was fixed).
 */
describe("TrainingPane after a document is reopened mid-training", () => {

  beforeEach(() => {
    trainingStore.model.reset();
    trainingStore.trainingResults = [];
    trainingStore.model.setBeingConstructed(true);
    trainingStore.model.setName("model 1");
    trainingStore.model.setTrainingInProgress(true);
    trainingStore.model.setTrainingInStepMode(true);
    trainingStore.setTrainingWasInterrupted(true);
  });

  it("names the model, says the run cannot be continued, and points at Cancel", () => {
    render(<TrainingPane />);

    expect(screen.getByText(
      "Training model 1 was stopped, and it cannot be picked up from where it left off. " +
      "Press Cancel to start over."
    )).toBeInTheDocument();
  });

  it("styles the message as an alert rather than an ordinary prompt", () => {
    const { container } = render(<TrainingPane />);

    expect(container.querySelector(".sq-training-pane > .sq-info-prompt"))
      .toHaveClass("sq-info-prompt-alert");
  });

  it("disables Step, since it cannot advance the run", () => {
    render(<TrainingPane />);

    expect(screen.getByRole("button", { name: "Step" })).toHaveAttribute("aria-disabled", "true");
  });

  it("leaves Cancel enabled as the way out", () => {
    render(<TrainingPane />);

    expect(screen.getByRole("button", { name: "Cancel" })).not.toHaveAttribute("aria-disabled", "true");
  });

  it("says nothing of the sort for a run started in this session", () => {
    trainingStore.setTrainingWasInterrupted(false);

    render(<TrainingPane />);

    expect(screen.queryByText(/cannot be picked up/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Step" })).toHaveAttribute("aria-disabled", "false");
  });
});
