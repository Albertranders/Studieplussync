export function shouldAutoOpenGuide({ guideCompleted, guideAutoOpened, allStepsCompleted }) {
  return !guideCompleted && !guideAutoOpened && !allStepsCompleted;
}
