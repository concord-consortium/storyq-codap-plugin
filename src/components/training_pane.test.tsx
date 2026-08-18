import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { TrainingResult } from "../stores/store_types_and_constants";
import { trainingStore } from "../stores/training_store";
import { stopAnyRunInFlight } from "../test/training-fixtures";
import { TrainingPane } from "./training_pane";

function restoredStepModeRun() {
  trainingStore.model.reset();
  trainingStore.trainingResults = [];
  trainingStore.setTrainingCouldNotBeResumed(false);
  trainingStore.setResumeIsPending(false);
  trainingStore.setRestoringRun(false);
  trainingStore.model.setBeingConstructed(true);
  trainingStore.model.setName("model 1");
  trainingStore.model.setTrainingInProgress(true);
  trainingStore.model.setTrainingInStepMode(true);
}

function promptOf(container: HTMLElement) {
  return container.querySelector(".sq-training-pane > .sq-info-prompt");
}

/**
 * A training run lives partly in memory, so a document saved mid-run reopens with a model that
 * claims to be training but has no fit loop left to continue and step cannot advance it.
 */
describe("TrainingPane after a document is reopened mid-training", () => {

  beforeEach(() => {
    restoredStepModeRun();
    trainingStore.setTrainingCouldNotBeResumed(true);
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
    trainingStore.setTrainingCouldNotBeResumed(false);

    render(<TrainingPane />);

    expect(screen.queryByText(/cannot be picked up/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Step" })).toHaveAttribute("aria-disabled", "false");
  });
});

describe("TrainingPane while a run is being restored", () => {

  beforeEach(() => {
    restoredStepModeRun();
    trainingStore.setRestoringRun(true);
  });

  it("names the model and says it is being put back where it left off", () => {
    render(<TrainingPane />);

    expect(screen.getByText("Restoring model 1 to where it left off…")).toBeInTheDocument();
  });

  it("disables Step and Cancel until the run is handed back", () => {
    render(<TrainingPane />);

    expect(screen.getByRole("button", { name: "Step" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute("aria-disabled", "true");

    act(() => trainingStore.setRestoringRun(false));

    expect(screen.getByRole("button", { name: "Step" })).toHaveAttribute("aria-disabled", "false");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute("aria-disabled", "false");
  });

  it("says so from the Step press that starts the replay, which is what a student waits on", () => {
    // A validated step-mode run looks exactly like a live one between steps until Step is pressed
    trainingStore.setRestoringRun(false);
    trainingStore.setResumeIsPending(true);
    const { logisticModel } = trainingStore.model;
    logisticModel._data = [[1, 0, 1], [0, 1, 0], [1, 1, 1]];
    const { container } = render(<TrainingPane />);
    const prompt = promptOf(container);
    expect(prompt).toHaveTextContent(/You can continue training your model/);

    fireEvent.click(screen.getByRole("button", { name: "Step" }));

    expect(promptOf(container)).toBe(prompt);
    expect(prompt).toHaveTextContent("Restoring model 1 to where it left off…");
    stopAnyRunInFlight();
  });

  it("does not tell the student to start over while the run is still being restored", () => {
    trainingStore.setTrainingCouldNotBeResumed(true);

    render(<TrainingPane />);

    expect(screen.getByText("Restoring model 1 to where it left off…")).toBeInTheDocument();
    expect(screen.queryByText(/cannot be picked up/)).not.toBeInTheDocument();
  });
});

/**
 * The branches of the prompt reconcile to a single DOM node, so a role added on the restoring
 * branch alone would arrive in the same commit as the message it is meant to announce. Asserting
 * the invariant rather than one transition also survives the transitions moving.
 */
describe("TrainingPane's prompt as a live region", () => {

  beforeEach(restoredStepModeRun);

  const branches: Array<{ name: string, setUp: () => void, text: RegExp }> = [
    {
      name: "no model yet and nothing trained",
      setUp: () => trainingStore.model.setBeingConstructed(false),
      text: /Train your model with the features you have prepared/
    },
    {
      name: "a trained model to build on",
      setUp: () => {
        trainingStore.model.setBeingConstructed(false);
        trainingStore.trainingResults = [{ name: "model 1", accuracy: 0.5 } as TrainingResult];
      },
      text: /You have trained 1 model/
    },
    {
      name: "a run being restored",
      setUp: () => trainingStore.setRestoringRun(true),
      text: /Restoring model 1 to where it left off/
    },
    {
      name: "a run that could not be resumed",
      setUp: () => trainingStore.setTrainingCouldNotBeResumed(true),
      text: /cannot be picked up/
    },
    {
      name: "a model still to be named",
      setUp: () => trainingStore.model.setName(""),
      text: /must have a name before you can train it/
    },
    {
      name: "a step-mode run between steps",
      setUp: () => undefined,
      text: /You can continue training your model/
    },
    {
      name: "a model ready to train",
      setUp: () => {
        trainingStore.model.setTrainingInProgress(false);
        trainingStore.model.setTrainingInStepMode(false);
      },
      text: /You can start training your model/
    }
  ];

  branches.forEach(({ name, setUp, text }) => {
    it(`carries role="status" with ${name}`, () => {
      setUp();

      const { container } = render(<TrainingPane />);

      expect(promptOf(container)).toHaveAttribute("role", "status");
      expect(promptOf(container)).toHaveTextContent(text);
    });
  });

  it("reuses the same node when the prompt changes, which is why every branch needs the role", () => {
    trainingStore.setRestoringRun(true);
    const { container } = render(<TrainingPane />);
    const prompt = promptOf(container);

    act(() => trainingStore.setRestoringRun(false));

    expect(promptOf(container)).toBe(prompt);
    expect(prompt).toHaveTextContent(/You can continue training your model/);
  });
});
