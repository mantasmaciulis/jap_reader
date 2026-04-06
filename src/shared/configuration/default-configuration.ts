import { JitenCardState } from '../jiten/types';
import { DEFAULT_WORD_STYLE_CONFIG } from '../word-style/themes';
import { ConfigurationSchema } from './types';

export const DEFAULT_CONFIGURATION = Object.freeze<ConfigurationSchema>({
  schemaVersion: 1,

  //#region Provider Selection
  parsingProvider: 'jiten',
  //#endregion

  //#region AI Features
  claudeApiKey: '',
  aiWordPrompt: `You are a language API that explains the specific nuance of specified word(s) in a sentence.

Respond concisely in no more than 100 words.

Specified word(s) MUST be in its original language.

All other explanation text MUST be in English.

In your response:

DO NOT OUTPUT the language name or the word 'nuance';

DO NOT OUTPUT the context sentence;

DO NOT OUTPUT romaji/pinyin or any notes on pronunciation;

Conclude with the specific nuance within the context sentence.

Format your response using simple HTML tags: <b> for emphasis, <br> for line breaks. ALWAYS add furigana to ALL kanji using <ruby> tags, e.g. <ruby>食<rt>た</rt></ruby>べる. Never write kanji without furigana.`,
  aiSentencePrompt: `You are a language API that does sentence breakdown-explanations.

First, output a natural English translation of the full sentence on its own line.

Then break down the sentence into SMALL chunks (1-3 words each, never whole clauses).

For each chunk, output exactly 3 numbered items on ONE line:
#1 chunk #2 meaning #3 grammar note

Example output format:
<b>The alchemist was banished from the court.</b><br><br>#1 <ruby>宮<rt>きゅう</rt></ruby><ruby>廷<rt>てい</rt></ruby>を #2 the court (object) #3 を marks the direct object<br>#1 <ruby>追<rt>つい</rt></ruby><ruby>放<rt>ほう</rt></ruby>されて #2 was banished #3 passive form of <ruby>追<rt>つい</rt></ruby><ruby>放<rt>ほう</rt></ruby>する + て-form

Rules:
- Chunks MUST be 1-3 words. Break large phrases into multiple chunks.
- #1 is the original Japanese. #2 is a short English meaning. #3 is a brief grammar note.
- Keep #3 under 15 words.
- One chunk per line, separated by <br>.
- DO NOT use dot-points, dashes, or labels like 'Chunk:'.
- DO NOT output romaji/pinyin.
- DO NOT output quotation marks.

Format: use <b> for the translation line. ALWAYS add furigana to ALL kanji using <ruby> tags, e.g. <ruby>食<rt>た</rt></ruby>べる. Never write kanji without furigana.`,
  //#endregion

  //#region Theme
  themeBgColour: '#181818',
  themeAccentColour: '#D8B9FA',
  //#endregion

  //#region Jiten Integration

  jitenApiKey: '',
  jitenApiEndpoint: 'https://api.jiten.moe/api',

  //#endregion
  //#region JPDB Integration

  jpdbApiToken: '',
  jpdbMiningDeck: '',
  jpdbBlacklistDeck: 'blacklist',
  jpdbNeverForgetDeck: 'never-forget',
  jpdbSuspendDeck: '',

  //#endregion
  //#region Mining configuration

  jitenAddToForq: false,
  setSentences: false,
  jitenDisableReviews: false,
  jitenUseTwoGrades: false,

  // JPDB Flag settings
  jitenRotateFlags: false,
  jitenRotateCycle: false,
  jitenCycleNeverForget: true,
  jitenCycleBlacklist: true,
  jitenCycleSuspended: false,

  //#endregion
  //#region Parsing

  hideInactiveTabs: true,
  showCurrentOnTop: true,
  showParseButton: true,

  enabledFeatures: [],
  disabledParsers: [],
  additionalHosts: '',
  additionalMeta: '[]',

  //#endregion
  //#region Texthighlighting

  newStates: [JitenCardState.NEW],

  markTopX: false,
  markAllTypes: false,
  markTopXCount: 10_000,
  markIPlus1: false,
  minSentenceLength: 3,
  iPlusOneMaxFrequency: false,
  iPlusOneMaxFrequencyCount: 15_000,
  skipFurigana: false,
  generatePitch: true,

  wordStyleConfig: structuredClone(DEFAULT_WORD_STYLE_CONFIG),
  customWordCSS: '',

  //#endregion
  //#region Popup

  showPopupOnHover: false,
  renderCloseButton: true,
  touchscreenSupport: false,
  touchscreenDoubleTap: false,
  touchscreenLongPress: false,
  touchscreenLongPressDuration: 250,
  disableFadeAnimation: false,
  leftAlignPopupToWord: false,

  // Popup settings
  hideAfterAction: true,
  hidePopupAutomatically: true,
  hidePopupDelay: 500,

  showMiningActions: true,
  moveMiningActions: false,

  showGradingActions: true,
  moveGradingActions: false,

  showRotateActions: false,
  moveRotateActions: false,

  showConjugations: true,
  showPitchDiagrams: false,
  disableHeadWordLink: false,

  customPopupCSS: '',

  //#endregion
  //#region Keybinds

  // General keybinds
  parseKey: [{ key: 'P', code: 'KeyP', modifiers: ['Alt'] }],
  showPopupKey: [{ key: 'Shift', code: 'ShiftLeft', modifiers: [] }],
  showAdvancedDialogKey: [],
  lookupSelectionKey: [{ key: 'L', code: 'KeyL', modifiers: ['Alt'] }],

  // Mining keybinds
  addToMiningKey: [],
  addToBlacklistKey: [],
  addToNeverForgetKey: [],
  addToSuspendedKey: [],
  cycleMasterBlacklistKey: [],

  // Review keybinds
  jitenReviewNothing: [],
  jitenReviewSomething: [],
  jitenReviewHard: [],
  jitenReviewOkay: [],
  jitenReviewEasy: [],
  jitenReviewFail: [],
  jitenReviewPass: [],

  // Rotation keybinds
  jitenRotateForward: [],
  jitenRotateBackward: [],

  //#endregion
  //#region Anki Integration (not implemented!)

  enableAnkiIntegration: false,
  ankiUrl: 'http://localhost:8765',
  ankiProxyUrl: '',
  ankiMiningConfig: {
    deck: '',
    model: '',
    proxy: false,
    wordField: '',
    readingField: '',
    templateTargets: [],
  },
  ankiBlacklistConfig: {
    deck: '',
    model: '',
    proxy: false,
    wordField: '',
    readingField: '',
    templateTargets: [],
  },
  ankiNeverForgetConfig: {
    deck: '',
    model: '',
    proxy: false,
    wordField: '',
    readingField: '',
    templateTargets: [],
  },
  ankiReadonlyConfigs: [],

  //#endregion
  //#region Status Bar

  statusBarEnabled: true,
  statusBarAutoHide: true,
  statusBarHideIcon: false,
  statusBarShowBadge: true,
  statusBarPosition: 'bottom',
  toggleStatusBarKey: [{ key: 'S', code: 'KeyS', modifiers: ['Alt'] }],

  //#endregion

  skipReleaseNotes: true,
  enableDebugMode: false,
});
