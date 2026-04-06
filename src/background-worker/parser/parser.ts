import { JitenToken } from '@shared/jiten/types';
import { ParsingProvider } from '@shared/providers/types';
import { Batch } from './parser.types';

export class Parser {
  constructor(
    private batch: Batch,
    private provider: ParsingProvider,
  ) {}

  public async parse(): Promise<void> {
    const paragraphs = this.batch.strings;
    const parsedTokens = await this.provider.parse(paragraphs);

    this.addSentenceInfo(paragraphs, parsedTokens);

    for (const [i, handle] of this.batch.handles.entries()) {
      handle.resolve(parsedTokens[i]);
    }
  }

  private addSentenceInfo(paragraphs: string[], tokens: JitenToken[][]): void {
    paragraphs.forEach((paragraph, i) => {
      const tokenData = tokens[i];
      const sentences = this.splitJapaneseTextIntoSentences(paragraph);

      if (sentences.length === 1) {
        tokenData.forEach((token) => {
          token.sentence = sentences[0];
        });

        return;
      }

      let offset = 0;

      for (let s = 0; s < sentences.length; s++) {
        const sentence = sentences[s];
        const compareSentence = sentence.replace(/(^[「『])|([。！？」』]$)/g, '');
        const positionInParagraphs = paragraph.substring(offset).indexOf(compareSentence);

        if (positionInParagraphs === -1) {
          continue;
        }

        const sentenceStart = offset + positionInParagraphs;

        const nextCompareSentence = sentences[s + 1]?.replace(/(^[「『])|([。！？」』]$)/g, '');
        const nextPosition = nextCompareSentence
          ? paragraph.indexOf(nextCompareSentence, sentenceStart + compareSentence.length)
          : -1;
        const sentenceEnd = nextPosition !== -1 ? nextPosition : paragraph.length;

        for (const token of tokenData) {
          if (token.start >= sentenceStart && token.end <= sentenceEnd) {
            token.sentence = sentence;
          }
        }

        offset = sentenceStart + compareSentence.length;
      }
    });
  }

  private splitJapaneseTextIntoSentences(text: string): string[] {
    // Regular expression to match sentence-ending punctuation marks and quotation marks
    const sentenceEndRegex = /.*?[。！？」』](?=\s?|$)|「.*?」|『.*?』/g;
    const sentences = text.match(sentenceEndRegex) || [];

    return sentences.length
      ? sentences
          .map((sentence) => sentence.trim())
          .filter(Boolean)
          .filter((sentence) => !/^[」』]$/.exec(sentence))
          .map((sentence) => {
            // If the sentence is a quotation, return it as is
            if (/「.*?」|『.*?』/.exec(sentence)) {
              return sentence;
            }

            // If a quotation contained multiple sentences, remove the quotation marks
            const trimmed = sentence.replace(/(^「|『)|(」|』$)/, '');

            // Add a period at the end of the sentence if it doesn't already have a sentence-ending punctuation mark
            return /[。！？]$/.exec(trimmed) ? trimmed : `${trimmed}。`;
          })
      : [text];
  }
}
