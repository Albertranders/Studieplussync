export function shouldAutoOpenGuide({ guideCompleted, guideAutoOpened, allStepsCompleted }) {
  return !guideCompleted && !guideAutoOpened && !allStepsCompleted;
}

export function canOpenGuide({ guideCompleted }) {
  return !guideCompleted;
}
