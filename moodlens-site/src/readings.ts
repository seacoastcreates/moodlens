// Real /analyze output from the live MoodLens model on sample entries (top 4
// labels each). The model scores every emotion independently, so a row can
// add up to more than 100% - a bittersweet entry reads as sad *and* loving.

export type SampleReading = {
  text: string;
  scores: [label: string, score: number][];
};

export const SAMPLE_READINGS: SampleReading[] = [
  {
    text: "Finally finished the garden bed I've been putting off all month. Dirt under my nails and I feel great.",
    scores: [["joy", 0.681], ["admiration", 0.299], ["excitement", 0.13], ["approval", 0.051]],
  },
  {
    text: "Called my sister this morning and we laughed about nothing for an hour.",
    scores: [["amusement", 0.796], ["joy", 0.327], ["neutral", 0.046], ["realization", 0.013]],
  },
  {
    text: "Finished a book I loved. Sad it's over, but so glad I read it.",
    scores: [["sadness", 0.599], ["love", 0.522], ["joy", 0.317], ["disappointment", 0.066]],
  },
  {
    text: "Woke up anxious about the deadline. A run helped a little.",
    scores: [["nervousness", 0.471], ["excitement", 0.111], ["fear", 0.102], ["neutral", 0.084]],
  },
];
