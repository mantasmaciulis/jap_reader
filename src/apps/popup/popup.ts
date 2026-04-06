import { getConfiguration } from '@shared/configuration/get-configuration';
import { createElement } from '@shared/dom/create-element';
import { findElements } from '@shared/dom/find-elements';
import { withElement } from '@shared/dom/with-element';
import { getStyleUrl } from '@shared/extension/get-style-url';
import { runtime } from '@shared/extension/runtime';
import { JitenCard, JitenCardState } from '@shared/jiten/types';
import { ForgetCardCommand } from '@shared/messages/background/forget-card.command';
import { UpdateCardStateCommand } from '@shared/messages/background/update-card-state.command';
import { onBroadcastMessage } from '@shared/messages/receiving/on-broadcast-message';
import { cleanReading, getPitchDiagramData } from '@shared/pitch-accent-utils';
import { getThemeCssVars } from '@shared/theme/get-theme-css-vars';
import { KeybindManager } from '../integration/keybind-manager';
import { Registry } from '../integration/registry';
import { GradingController } from './actions/grading-controller';
import { MiningController } from './actions/mining-controller';
import { RotationController } from './actions/rotation-controller';
import { ConfirmDialog } from './confirm-dialog';
import { PARTS_OF_SPEECH, PARTS_OF_SPEECH_SHORT } from './part-of-speech';

export class Popup {
  private _keyManager = new KeybindManager([], {
    keydown: (e: MouseEvent | KeyboardEvent): void => this.handleKeydown(e),
  });

  /**
   * This is the root element of the popup, which is attached to the host page or iframe.
   * It manages the shadow root isolating the actual popup content.
   */
  private _root: HTMLDivElement = createElement('div', {
    id: 'ajb-popup',
    events: {
      onmousedown: (ev: MouseEvent) => ev.stopPropagation(),
      onclick: (ev: MouseEvent) => ev.stopPropagation(),
      onwheel: (ev: WheelEvent) => ev.stopPropagation(),
    },
    style: {
      all: 'initial',
      zIndex: '2147483647',
      position: 'absolute',
      top: '0',
      left: '0',
      opacity: '0',
      visibility: 'hidden',
    },
  });

  //#region Utility Accessors

  /** Theme CSS variables - syncronised with extension storage */
  private _themeStyles: HTMLStyleElement = createElement('style');
  /** The user declared styles - syncronised with extension storage */
  private _customStyles: HTMLStyleElement = createElement('style');

  private _closeButton = createElement('section', {
    id: 'close',
    class: ['controls'],
    style: {
      display: 'none', // Hidden by default
    },
    children: [
      createElement('a', {
        id: 'close-btn',
        class: ['outline', 'close'],
        handler: () => this.hide(),
      }),
    ],
  });
  /** Contains the buttons to manage the card rotation */
  private _rotateButtons = createElement('section', { id: 'rotation', class: ['controls'] });
  /** Contains the grading buttons and the more-actions menu */
  private _actionBar = createElement('section', { id: 'action-bar', class: ['controls'] });
  /** Dropdown menu for deck actions (never-forget, blacklist, forget) */
  private _moreMenu = createElement('div', { id: 'more-menu' });
  /** Contains the header data - all information about a word except its meaning */
  private _context = createElement('section', { id: 'context' });
  /** Contains the various meanings of a word */
  private _details = createElement('section', { id: 'details' });
  /** Instant tooltip for POS labels */
  private _tooltip = createElement('div', { id: 'pos-tooltip' });

  //#endregion

  /**
   * The rendered popup content itself
   */
  private _popup: HTMLDivElement = createElement('div', {
    class: ['popup'],
    events: {
      onmouseenter: () => this.startHover(),
      onmouseleave: () => this.stopHover(),
    },
    children: [],
  });

  private _touchscreenSupport: boolean;
  private _renderCloseButton: boolean;
  private _hidePopupAutomatically: boolean;
  private _hidePopupDelay: number;
  private _hideAfterAction: boolean;
  private _disableFadeAnimation: boolean;
  private _leftAlignPopupToWord: boolean;
  private _showConjugations: boolean;
  private _showPitchDiagrams: boolean;
  private _disableHeadWordLink: boolean;
  private _parsingProvider: string;

  private _hideTimer?: NodeJS.Timeout;
  private _isHover?: boolean;
  private _confirmDialog?: ConfirmDialog;
  private _popupLeft = 0;
  private _popupTop = 0;

  private _cardContext?: HTMLElement;
  private _conjugations?: string[];
  private _card?: JitenCard;
  private _sentence?: string;
  private _sentenceHtml?: string;
  private _activeView: 'dict' | 'sentence' | 'word' | 'history' = 'dict';
  private _aiPort?: chrome.runtime.Port;
  private _aiCleanup?: () => void;

  constructor(
    private _mining: MiningController,
    private _rotation: RotationController,
    private _grading: GradingController,
  ) {
    this.renderNodes();

    onBroadcastMessage('cardStateUpdated', (wordId, readingIndex) => {
      setTimeout(() => {
        this._card = Registry.getCard(wordId, readingIndex);

        if (this._hideAfterAction) {
          return this.hide();
        }

        this.rerender();
      }, 1);
    });
    onBroadcastMessage('configurationUpdated', () => this.applyConfiguration(), true);
  }

  public show(context: HTMLElement, sentence?: string): void {
    this._cardContext = context;
    this._card = Registry.getCardFromElement(context);
    this._sentence = sentence;
    this._sentenceHtml = this.buildSentenceWithFurigana();
    this._conjugations = Registry.getConjugations(context);

    this.clearTimer();
    this.updateParentElement();
    this.rerender();
    this.setPosition();

    Object.assign<CSSStyleDeclaration, Partial<CSSStyleDeclaration>>(this._root.style, {
      transition: this._disableFadeAnimation ? 'none' : 'opacity 60ms ease-in, visibility 60ms',
      opacity: '1',
      visibility: 'visible',
    });

    this._keyManager.activate();
  }

  public hide(): void {
    this.stopAiStream();

    Object.assign<CSSStyleDeclaration, Partial<CSSStyleDeclaration>>(this._root.style, {
      transition: this._disableFadeAnimation ? 'none' : 'opacity 200ms ease-in, visibility 20ms',
      opacity: '0',
      visibility: 'hidden',
    });

    this._keyManager.deactivate();
  }

  public initHide(): void {
    if (!this._hidePopupAutomatically) {
      return;
    }

    if (!this._hidePopupDelay) {
      this.hide();

      return;
    }

    this.startTimer();
  }

  public disablePointerEvents(): void {
    this._root.style.pointerEvents = 'none';
    this._root.style.userSelect = 'none';
  }

  public enablePointerEvents(): void {
    this._root.style.pointerEvents = '';
    this._root.style.userSelect = '';
  }

  //#region Configuration

  private async applyConfiguration(): Promise<void> {
    this._hidePopupAutomatically = await getConfiguration('hidePopupAutomatically');
    this._hidePopupDelay = await getConfiguration('hidePopupDelay');
    this._hideAfterAction = await getConfiguration('hideAfterAction');
    this._disableFadeAnimation = await getConfiguration('disableFadeAnimation');
    this._leftAlignPopupToWord = await getConfiguration('leftAlignPopupToWord');

    this._renderCloseButton = await getConfiguration('renderCloseButton');
    this._touchscreenSupport = await getConfiguration('touchscreenSupport');
    this._showConjugations = await getConfiguration('showConjugations');
    this._showPitchDiagrams = await getConfiguration('showPitchDiagrams');
    this._disableHeadWordLink = await getConfiguration('disableHeadWordLink');
    this._parsingProvider = await getConfiguration('parsingProvider');

    this._themeStyles.textContent = await getThemeCssVars();
    this._customStyles.textContent = await getConfiguration('customPopupCSS');

    this._closeButton.style.display =
      this._touchscreenSupport && this._renderCloseButton ? 'flex' : 'none';

    this.updateActionBar();
    this.updateRotationButtons();
    this.applyPositions();
  }

  //#endregion
  //#region Install the popup

  /**
   * Installs all components and initializes the shadow root
   */
  private renderNodes(): void {
    const shadowRoot = this._root.attachShadow({ mode: 'closed' });

    shadowRoot.append(
      createElement('link', { attributes: { rel: 'stylesheet', href: getStyleUrl('popup') } }),
      this._themeStyles,
      this._customStyles,
      this._popup,
      this._tooltip,
    );

    this._confirmDialog = new ConfirmDialog(shadowRoot, () => ({
      x: this._popupLeft,
      y: this._popupTop,
    }));
  }

  private updateParentElement(): void {
    const parentElement = this.getParentElement();

    if (!this._root.parentElement?.isSameNode(parentElement)) {
      parentElement.appendChild(this._root);
    }
  }

  private getParentElement(): HTMLElement {
    const fullscreenVideoElement = this.getFullscreenVideoElement();

    if (fullscreenVideoElement?.parentElement) {
      return this.findElementForFullscreenVideoDisplay(fullscreenVideoElement);
    }

    return document.body;
  }

  private getFullscreenVideoElement(): HTMLElement | undefined {
    if (!document.fullscreenElement) {
      return;
    }

    return findElements('video').find((videoElement) =>
      document.fullscreenElement!.contains(videoElement),
    );
  }

  private findElementForFullscreenVideoDisplay(videoElement: HTMLElement): HTMLElement {
    let currentNode: HTMLElement | null = videoElement.parentElement;
    let chosenNode: HTMLElement | undefined;

    const testNode = document.createElement('div');

    testNode.style.position = 'absolute';
    testNode.style.zIndex = '2147483647';
    testNode.innerText = '&nbsp;'; // The node needs to take up some space to perform test clicks

    while (currentNode && !currentNode.isSameNode(document.body.parentElement)) {
      const rect = currentNode.getBoundingClientRect();

      if (
        rect.height > 0 &&
        (chosenNode === undefined || rect.height >= chosenNode.getBoundingClientRect().height) &&
        this.elementIsClickableInsideContainer(currentNode, testNode)
      ) {
        chosenNode = currentNode;

        break;
      }

      currentNode = currentNode.parentElement;
    }

    return chosenNode ?? document.body;
  }

  private elementIsClickableInsideContainer(container: HTMLElement, element: HTMLElement): boolean {
    container.appendChild(element);

    const rect = element.getBoundingClientRect();
    const clickedElement = document.elementFromPoint(rect.x, rect.y);
    const clickable = element.isSameNode(clickedElement) || element.contains(clickedElement);

    element.remove();

    return clickable;
  }

  //#endregion
  //#region Position the popup

  private setPosition(): void {
    const clamp = (value: number, min: number, max: number): number =>
      Math.min(Math.max(value, min), max);

    const { writingMode } = getComputedStyle(this._cardContext!);
    const { x, y } = this._cardContext!.getBoundingClientRect();
    const { offsetWidth: popupWidth, offsetHeight: popupHeight } = this._popup;
    const { innerWidth, innerHeight, scrollX, scrollY } = window;
    const { top, right, bottom, left } = this.getClosestClientRect(this._cardContext!, x, y);

    const wordLeft = scrollX + left;
    const wordTop = scrollY + top;
    const wordRight = scrollX + right;
    const wordBottom = scrollY + bottom;

    const leftSpace = left;
    const topSpace = top;
    const rightSpace = innerWidth - right;
    const bottomSpace = innerHeight - bottom;

    const minLeft = scrollX;
    const maxLeft = scrollX + innerWidth - popupWidth;
    const minTop = scrollY;
    const maxTop = scrollY + innerHeight - popupHeight;

    let popupLeft: number;
    let popupTop: number;

    if (writingMode.startsWith('horizontal')) {
      popupTop = clamp(bottomSpace > topSpace ? wordBottom : wordTop - popupHeight, minTop, maxTop);
      popupLeft = clamp(
        rightSpace > leftSpace ? wordLeft : wordRight - popupWidth,
        minLeft,
        maxLeft,
      );
    } else {
      popupTop = clamp(bottomSpace > topSpace ? wordTop : wordBottom - popupHeight, minTop, maxTop);
      popupLeft = clamp(
        rightSpace > leftSpace ? wordRight : wordLeft - popupWidth,
        minLeft,
        maxLeft,
      );
    }

    if (this._leftAlignPopupToWord) {
      // Align the popup to the left of the word
      // Ensure the popup does not overflow the right edge of the screen, also add a bit of padding
      popupLeft = Math.min(wordLeft, innerWidth - popupWidth - 8);
    }

    if (innerWidth < 450) {
      popupLeft = 8;

      // we subtract 32px to account for the left and right padding
      this._root.style.width = `${innerWidth - 32}px`;
      this._popup.style.width = `${innerWidth - 32}px`;
    }

    this._popupLeft = popupLeft;
    this._popupTop = popupTop;
    this._root.style.transform = `translate(${popupLeft}px, ${popupTop}px)`;
  }

  private getClosestClientRect(elem: HTMLElement, x: number, y: number): DOMRect {
    const rects = elem.getClientRects();

    if (rects.length === 1) {
      return rects[0];
    }

    // Merge client rects that are adjacent
    // This works around a Chrome issue, where sometimes, non-deterministically,
    // inline child elements will get separate client rects, even if they are on the same line.
    const { writingMode } = getComputedStyle(elem);
    const horizontal = writingMode.startsWith('horizontal');
    const mergedRects = [];

    for (const rect of rects) {
      if (mergedRects.length === 0) {
        mergedRects.push(rect);

        continue;
      }

      const prevRect: DOMRect = mergedRects[mergedRects.length - 1];

      if (horizontal) {
        if (rect.bottom === prevRect.bottom && rect.left === prevRect.right) {
          mergedRects[mergedRects.length - 1] = new DOMRect(
            prevRect.x,
            prevRect.y,
            rect.right - prevRect.left,
            prevRect.height,
          );
        } else {
          mergedRects.push(rect);
        }
      } else {
        if (rect.right === prevRect.right && rect.top === prevRect.bottom) {
          mergedRects[mergedRects.length - 1] = new DOMRect(
            prevRect.x,
            prevRect.y,
            prevRect.width,
            rect.bottom - prevRect.top,
          );
        } else {
          mergedRects.push(rect);
        }
      }
    }

    return mergedRects
      .map((rect) => ({
        rect,
        distance:
          Math.max(rect.left - x, 0, x - rect.right) ** 2 +
          Math.max(rect.top - y, 0, y - rect.bottom) ** 2,
      }))
      .reduce((a, b) => (a.distance <= b.distance ? a : b)).rect;
  }

  //#endregion
  //#region Button Renderer

  private updateActionBar(): void {
    const gradeButtons = this._grading.getGradingActions().map((grade) =>
      createElement('a', {
        id: grade,
        class: ['outline', grade],
        innerText: grade,
        handler: () => this._grading.gradeCard(this._card!, grade),
      }),
    );

    const moreButton = createElement('a', {
      id: 'more-btn',
      class: ['outline', 'more'],
      handler: () => this.toggleMoreMenu(),
    });

    this.buildMoreMenu();

    const showGrading = this._grading.showActions;
    const showMining = this._mining.showActions;

    this._actionBar.replaceChildren(
      ...(showGrading ? gradeButtons : []),
      ...(showMining ? [moreButton] : []),
      this._moreMenu,
    );

    this._actionBar.style.display = showGrading || showMining ? '' : 'none';
  }

  private buildMoreMenu(): void {
    const performFlaggedDeckAction = (key: 'neverForget' | 'blacklist' | 'suspend'): void => {
      const action = this.cardHasState(key, this._card!) ? 'remove' : 'add';

      this._mining.addOrRemove(action, key, this._card!);
    };

    const items: HTMLElement[] = [];

    const menuItems: {
      cls: string;
      label: string;
      handler: () => void;
      condition?: boolean;
    }[] = [
      {
        cls: 'never-forget',
        label: 'Never forget',
        handler: () => performFlaggedDeckAction('neverForget'),
      },
      {
        cls: 'blacklist',
        label: 'Blacklist',
        handler: () => performFlaggedDeckAction('blacklist'),
      },
      {
        cls: 'forget',
        label: 'Forget',
        handler: () => void this.handleForgetClick(),
        condition: this._parsingProvider !== 'jpdb',
      },
    ];

    for (const item of menuItems) {
      if (item.condition === false) {
        continue;
      }

      items.push(
        createElement('a', {
          class: ['menu-item', item.cls],
          innerText: item.label,
          handler: () => {
            item.handler();
            this.hideMoreMenu();
          },
        }),
      );
    }

    this._moreMenu.replaceChildren(...items);
  }

  private toggleMoreMenu(): void {
    this._moreMenu.classList.toggle('open');
  }

  private hideMoreMenu(): void {
    this._moreMenu.classList.remove('open');
  }

  private showTooltip(text: string, anchor: HTMLElement): void {
    this._tooltip.textContent = text;
    this._tooltip.classList.add('visible');

    const anchorRect = anchor.getBoundingClientRect();
    const popupRect = this._popup.getBoundingClientRect();

    const left = anchorRect.left - popupRect.left;
    const top = anchorRect.top - popupRect.top - 4;

    this._tooltip.style.left = `${left}px`;
    this._tooltip.style.top = `${top}px`;
  }

  private hideTooltip(): void {
    this._tooltip.classList.remove('visible');
  }

  private sanitizeHtml(html: string): string {
    const div = document.createElement('div');

    div.innerHTML = html;

    for (const el of Array.from(div.querySelectorAll('*'))) {
      const tag = el.tagName.toLowerCase();

      if (!['b', 'i', 'br', 'strong', 'em', 'ruby', 'rt'].includes(tag)) {
        el.replaceWith(...Array.from(el.childNodes));
      }

      for (const attr of Array.from(el.attributes)) {
        el.removeAttribute(attr.name);
      }
    }

    return div.innerHTML;
  }

  private buildSentenceWithFurigana(): string {
    if (!this._cardContext || !this._sentence) {
      return '';
    }

    const parent = this._cardContext.parentElement;

    if (!parent) {
      return this._sentence;
    }

    const words = Array.from(parent.querySelectorAll('.jiten-word'));
    const sentenceWords = words.filter(
      (el) => Registry.wordEventDelegator.getSentence(el) === this._sentence,
    );

    if (sentenceWords.length === 0) {
      return this._sentence;
    }

    return sentenceWords.map((el) => el.innerHTML).join('');
  }

  private stopAiStream(): void {
    this._aiCleanup?.();
    this._aiCleanup = undefined;
    this._aiPort?.disconnect();
    this._aiPort = undefined;
  }

  private resetToMeanings(): void {
    this._activeView = 'dict';
    this.updateActiveQuickAction();

    if (this._card) {
      this.adjustDetails(this._card);
    }
  }

  private updateActiveQuickAction(): void {
    const actions = this._popup.querySelectorAll('#quick-actions .quick-action');

    for (const el of Array.from(actions)) {
      el.classList.toggle('active', el.getAttribute('data-view') === this._activeView);
    }
  }

  private streamAi(label: string, promptKey: string, userContent: string, maxTokens: number): void {
    this.stopAiStream();

    const port = runtime.connect({ name: 'ai-stream' });

    this._aiPort = port;

    // Build DOM structure once
    const textEl = createElement('div', { class: 'ai-text' });
    const children: HTMLElement[] = [];

    if (this._sentenceHtml) {
      const sentenceEl = createElement('div', {
        class: 'ai-sentence',
        attributes: { lang: 'ja' },
      });

      sentenceEl.innerHTML = this._sentenceHtml;
      children.push(sentenceEl);
    }

    children.push(createElement('div', { class: 'ai-label', innerText: label }), textEl);
    this._details.replaceChildren(createElement('div', { class: 'ai-result', children }));

    // Smooth animation state
    let rawBuffer = '';
    let displayedLen = 0;
    let streamDone = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const CHARS_PER_TICK = 3;
    const TICK_MS = 16;

    const tick = (): void => {
      if (displayedLen >= rawBuffer.length) {
        if (streamDone && timer) {
          clearInterval(timer);
          timer = null;
        }

        return;
      }

      displayedLen = Math.min(displayedLen + CHARS_PER_TICK, rawBuffer.length);
      textEl.innerHTML = this.sanitizeHtml(rawBuffer.substring(0, displayedLen));
    };

    const cleanup = (): void => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    this._aiCleanup = cleanup;

    port.onMessage.addListener((msg: { type: string; text?: string; message?: string }) => {
      if (this._aiPort !== port) {
        cleanup();

        return;
      }

      if (msg.type === 'chunk' && msg.text) {
        rawBuffer += msg.text;

        if (!timer) {
          timer = setInterval(tick, TICK_MS);
        }
      }

      if (msg.type === 'done') {
        streamDone = true;
        this._aiPort = undefined;
        port.disconnect();
      }

      if (msg.type === 'error') {
        cleanup();
        this._aiPort = undefined;
        port.disconnect();
        this._details.replaceChildren(
          createElement('div', {
            class: 'ai-loading',
            innerText: msg.message ?? 'Failed to get response.',
          }),
        );
      }
    });

    port.postMessage({ type: 'stream', promptKey, userContent, maxTokens });
  }

  private explainSentence(): void {
    this._activeView = 'sentence';
    this.updateActiveQuickAction();

    if (!this._sentence) {
      return;
    }

    this.streamAi('Sentence Breakdown', 'aiSentencePrompt', this._sentence, 1024);
  }

  private explainWord(): void {
    this._activeView = 'word';
    this.updateActiveQuickAction();

    if (!this._card || !this._sentence) {
      return;
    }

    this.streamAi(
      'AI Explanation',
      'aiWordPrompt',
      `Sentence: ${this._sentence}\n\nWord: ${this._card.spelling}`,
      256,
    );
  }

  private async handleForgetClick(): Promise<void> {
    if (!this._card || !this._confirmDialog) {
      return;
    }

    const confirmed = await this._confirmDialog.show({
      message: 'Forget this card? The card state and all reviews will be permanently deleted.',
      confirmText: 'Forget',
      cancelText: 'Cancel',
      confirmClass: 'forget',
    });

    if (!confirmed) {
      return;
    }

    const { wordId, readingIndex } = this._card;

    new ForgetCardCommand(wordId, readingIndex).send(() => {
      new UpdateCardStateCommand(wordId, readingIndex).send();
    });
  }

  private updateRotationButtons(): void {
    const previous = createElement('a', {
      id: 'previous',
      class: ['outline', 'previous'],
      innerText: 'Previous',
      handler: () => this._rotation.rotate(this._card!, -1),
    });
    const next = createElement('a', {
      id: 'next',
      class: ['outline', 'next'],
      innerText: 'Next',
      handler: () => this._rotation.rotate(this._card!, 1),
    });

    this._rotateButtons.replaceChildren(previous, next);
    this._rotateButtons.style.display = this._rotation.showActions ? '' : 'none';
  }

  private applyPositions(): void {
    this._popup.replaceChildren(
      this._closeButton,
      this._context,
      this._details,
      this._actionBar,
      this._rotateButtons,
    );
  }

  //#endregion
  //#region Card Utils

  private cardHasState(state: 'neverForget' | 'blacklist' | 'suspend', card: JitenCard): boolean {
    const stateMap: Record<'neverForget' | 'blacklist' | 'suspend', JitenCardState> = {
      neverForget: JitenCardState.MASTERED,
      blacklist: JitenCardState.BLACKLISTED,
      suspend: JitenCardState.BLACKLISTED,
    };

    return card.cardState.includes(stateMap[state]);
  }

  //#endregion
  //#region On showing a popup

  private rerender(): void {
    if (!this._card) {
      return;
    }

    this._activeView = 'dict';
    this.adjustMoreMenu(this._card);
    this.adjustRotateButtons(this._card);
    this.hideMoreMenu();
    this.adjustContext(this._card);
    this.adjustDetails(this._card);
    this.updateActiveQuickAction();

    this._popup.setAttribute('class', `popup ${this._card.cardState.join(' ')}`);
  }

  private adjustMoreMenu(card: JitenCard): void {
    const isNF = this.cardHasState('neverForget', card);
    const isBL = this.cardHasState('blacklist', card);

    withElement(this._moreMenu, '.never-forget', (el) => {
      el.innerText = isNF ? 'Remove Never Forget' : 'Never forget';
    });
    withElement(this._moreMenu, '.blacklist', (el) => {
      el.innerText = isBL ? 'Remove Blacklist' : 'Blacklist';
    });
  }

  private adjustRotateButtons(card: JitenCard): void {
    const previous = this._rotation.getNextCardState(card, -1);
    const next = this._rotation.getNextCardState(card, 1);
    const same = previous === next;

    const getText = (state: string | undefined, arrow?: 'left' | 'right'): string => {
      const text = !state
        ? 'Unflag'
        : state
            .replace(/^\w/, (c) => c.toUpperCase())
            .replace(/([a-z])([A-Z])/g, (c) => `${c[0]} ${c[1].toLowerCase()}`);

      if (arrow === 'left') {
        return `← ${text}`;
      }

      if (arrow === 'right') {
        return `${text} →`;
      }

      return text;
    };
    const getCls = (state: string | undefined): string => {
      if (!state) {
        return '';
      }

      return state.replace(/([a-z])([A-Z])/g, (c) => `${c[0]}-${c[1].toLowerCase()}`);
    };

    withElement(this._rotateButtons, '#previous', (el) => {
      el.style.display = same ? 'none' : '';
      el.innerText = getText(previous, 'left');

      el.setAttribute('class', `outline previous ${getCls(previous)}`);
    });

    withElement(this._rotateButtons, '#next', (el) => {
      el.innerText = getText(next, same ? undefined : 'right');

      el.setAttribute('class', `outline next ${getCls(next)}`);
    });
  }

  private adjustContext(card: JitenCard): void {
    this._context.replaceChildren(
      createElement('div', {
        id: 'header',
        class: 'subsection',
        children: [
          this.getReadingBlock(card),
          createElement('div', {
            id: 'header-meta',
            children: [
              createElement('div', {
                id: 'header-info',
                children: [this.getCardStateBlock(card), this.getFrequencyBlock(card)],
              }),
              this.getQuickActions(card),
            ],
          }),
        ],
      }),
      createElement('div', {
        id: 'meta',
        class: 'subsection',
        children: [this.getPitchAccentBlock(card)],
      }),
    );
  }

  private getQuickActions(card: JitenCard): HTMLDivElement {
    const svgIcon = (
      view: string,
      path: string,
      title: string,
      handler?: () => void,
    ): HTMLElement => {
      const wrapper = createElement('div', {
        class: 'quick-action',
        attributes: { title, 'data-view': view },
        handler,
      });

      wrapper.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" ' +
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        `${path}</svg>`;

      return wrapper;
    };

    const canAddToDeck =
      card.cardState.includes(JitenCardState.NOT_IN_DECK) ||
      card.cardState.includes(JitenCardState.NEW);

    const children = [
      svgIcon(
        'dict',
        '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>' +
          '<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
        'Dictionary',
        () => this.resetToMeanings(),
      ),
      svgIcon(
        'sentence',
        '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
        'Explain sentence',
        () => this.explainSentence(),
      ),
      svgIcon(
        'word',
        '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>' +
          '<line x1="12" y1="17" x2="12.01" y2="17"/>',
        'Explain word in context',
        () => this.explainWord(),
      ),
    ];

    if (this._parsingProvider !== 'jpdb') {
      children.push(
        svgIcon(
          'history',
          '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
          'Review history',
        ),
      );
    }

    if (canAddToDeck) {
      children.push(
        svgIcon('add', '<path d="M12 5v14M5 12h14"/>', 'Add to deck', () => {
          if (this._card) {
            this._mining.addOrRemove('add', 'mining', this._card);
          }
        }),
      );
    }

    return createElement('div', { id: 'quick-actions', children });
  }

  private getReadingBlock(card: JitenCard): HTMLElement {
    const { wordId, spelling, reading, readingIndex, wordWithReading } = card;
    const nodes = this.convertToRubyNodes(wordWithReading ?? spelling);

    if (this._disableHeadWordLink) {
      const span = createElement('span', {
        id: 'link',
        attributes: { lang: 'ja' },
      });

      span.append(...nodes);

      return span;
    }

    const url =
      this._parsingProvider === 'jpdb'
        ? `https://jpdb.io/vocabulary/${wordId}/${encodeURIComponent(spelling)}/${encodeURIComponent(reading)}`
        : `https://jiten.moe/vocabulary/${wordId}/${readingIndex}`;

    const a = createElement('a', {
      id: 'link',
      attributes: { href: url, target: '_blank', lang: 'ja' },
    });

    a.append(...nodes);

    return a;
  }

  private convertToRubyNodes(wordWithReading: string): Node[] {
    // If no brackets, return as a single text node
    if (!wordWithReading.includes('[')) {
      return [document.createTextNode(wordWithReading)];
    }

    // Regex to match kanji[reading] patterns
    const regex = /([^\u3040-\u309F\u30A0-\u30FF]+)\[(.+?)\]/g;
    const nodes: Node[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(wordWithReading)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        nodes.push(document.createTextNode(wordWithReading.slice(lastIndex, match.index)));
      }

      // Create ruby element
      const ruby = document.createElement('ruby');

      const rt = document.createElement('rt');

      rt.textContent = match[2];

      ruby.append(document.createTextNode(match[1]));
      ruby.append(rt);

      nodes.push(ruby);

      lastIndex = regex.lastIndex;
    }

    // Add any remaining text after the last match
    if (lastIndex < wordWithReading.length) {
      nodes.push(document.createTextNode(wordWithReading.slice(lastIndex)));
    }

    return nodes;
  }

  private getCardStateBlock(card: JitenCard): HTMLDivElement {
    const { cardState } = card;

    return createElement('div', {
      id: 'state',
      children: cardState.map((s) => createElement('span', { class: [s], innerText: s })),
    });
  }

  private getPitchAccentBlock(card: JitenCard): HTMLDivElement {
    const container = createElement('div', { id: 'pitch-accent' });

    if (!this._showPitchDiagrams) {
      return container;
    }

    const kana = cleanReading(card.reading);

    for (const pitch of card.pitchAccents) {
      const svg = this.renderPitchDiagram(kana, pitch);

      if (svg) {
        container.appendChild(svg);
      }
    }

    return container;
  }

  private renderPitchDiagram(reading: string, pitchNum: number): SVGSVGElement | null {
    const data = getPitchDiagramData(reading, pitchNum);

    if (!data) {
      return null;
    }

    const { morae, pattern, color } = data;
    const ns = 'http://www.w3.org/2000/svg';
    const pointCount = pattern.length;
    const stepX = 18;
    const padX = 9;
    const width = pointCount * stepX;
    const height = 38;
    const highY = 5;
    const lowY = 17;
    const radius = 3;
    const textOffset = 8;

    const svg = document.createElementNS(ns, 'svg');

    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const points = pattern.map((v, i) => ({
      x: padX + i * stepX,
      y: v === 1 ? highY : lowY,
    }));

    const polyline = document.createElementNS(ns, 'polyline');

    polyline.setAttribute('points', points.map((p) => `${p.x},${p.y}`).join(' '));
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', color);
    polyline.setAttribute('stroke-width', '1.5');
    svg.appendChild(polyline);

    for (let i = 0; i < pointCount; i++) {
      const isParticle = i === pointCount - 1;
      const circle = document.createElementNS(ns, 'circle');

      circle.setAttribute('cx', String(points[i].x));
      circle.setAttribute('cy', String(points[i].y));
      circle.setAttribute('r', String(radius));
      circle.setAttribute('fill', isParticle ? '#fff' : color);
      circle.setAttribute('stroke', color);
      circle.setAttribute('stroke-width', '1.5');
      svg.appendChild(circle);

      if (!isParticle && morae[i]) {
        const text = document.createElementNS(ns, 'text');

        text.setAttribute('x', String(points[i].x));
        text.setAttribute('y', String(points[i].y + textOffset));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'hanging');
        text.setAttribute('fill', color);
        text.setAttribute('font-size', '9');
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('font-family', "'Noto Sans JP', sans-serif");
        text.textContent = morae[i];
        svg.appendChild(text);
      }
    }

    return svg;
  }

  private getFrequencyBlock(card: JitenCard): HTMLDivElement {
    const { frequencyRank } = card;

    return createElement('div', {
      id: 'frequency',
      innerText: frequencyRank ? `#${frequencyRank}` : '',
    });
  }

  private getConjugationsBlock(conjugations: string[]): HTMLDivElement | null {
    if (!conjugations || conjugations.length === 0) {
      return null;
    }

    return createElement('div', {
      id: 'conjugations',
      children: [
        createElement('span', {
          class: 'label',
          innerText: 'Conjugations: ',
        }),
        createElement('span', {
          innerText: conjugations.join(' ; '),
        }),
      ],
    });
  }

  private adjustDetails(card: JitenCard): void {
    const groupedMeanings = this.getGroupedMeanings(card);
    const conjugationsBlock =
      this._conjugations && this._showConjugations
        ? this.getConjugationsBlock(this._conjugations)
        : null;

    const children = [];

    if (conjugationsBlock) {
      children.push(conjugationsBlock);
    }

    children.push(
      ...groupedMeanings.flatMap(({ partsOfSpeech, glosses, startIndex }) => [
        createElement('div', {
          class: 'pos',
          children: partsOfSpeech
            .map((pos) => ({
              short: PARTS_OF_SPEECH_SHORT[pos] ?? PARTS_OF_SPEECH[pos] ?? pos,
              full: PARTS_OF_SPEECH[pos] ?? pos,
            }))
            .filter(({ short }) => Boolean(short))
            .map(({ short, full }) =>
              createElement('span', {
                innerText: short,
                events:
                  short !== full
                    ? {
                        onmouseenter: (e: MouseEvent): void =>
                          this.showTooltip(full, e.target as HTMLElement),
                        onmouseleave: (): void => this.hideTooltip(),
                      }
                    : {},
              }),
            ),
        }),
        createElement('ol', {
          attributes: {
            start: (startIndex + 1).toString(),
          },
          children: glosses.map((g) =>
            createElement('li', {
              innerText: g.join('; '),
            }),
          ),
        }),
      ]),
    );

    this._details.replaceChildren(...children);
  }

  private getGroupedMeanings(card: JitenCard): {
    partsOfSpeech: string[];
    glosses: string[][];
    startIndex: number;
  }[] {
    const { meanings } = card;
    const groupedMeanings: {
      partsOfSpeech: string[];
      glosses: string[][];
      startIndex: number;
    }[] = [];

    let lastPos: string[] = [];

    for (const [index, meaning] of meanings.entries()) {
      const currentPartsOfSpeech = Array.isArray(meaning.partsOfSpeech)
        ? meaning.partsOfSpeech
        : [meaning.partsOfSpeech];

      if (
        currentPartsOfSpeech.length == lastPos.length &&
        currentPartsOfSpeech.every((p, i) => p === lastPos[i])
      ) {
        groupedMeanings[groupedMeanings.length - 1].glosses.push(meaning.glosses);

        continue;
      }
      groupedMeanings.push({
        partsOfSpeech: currentPartsOfSpeech,
        glosses: [meaning.glosses],
        startIndex: index,
      });

      lastPos = meaning.partsOfSpeech;
    }

    return groupedMeanings;
  }

  //#endregion
  //#region Others

  private isVisibile(): boolean {
    return this._root.style.visibility === 'visible';
  }

  private startHover(): void {
    if (!this.isVisibile()) {
      return;
    }

    this._isHover = true;
    this.clearTimer();
  }

  private stopHover(): void {
    this._isHover = false;

    if (!this.isVisibile()) {
      return;
    }

    if (this._confirmDialog?.isOpen) {
      return;
    }

    if (!this._hidePopupAutomatically) {
      return;
    }

    if (!this._hidePopupDelay) {
      this.hide();

      return;
    }

    this.startTimer();
  }

  private handleKeydown(e: MouseEvent | KeyboardEvent): void {
    if (!document.hasFocus()) {
      return;
    }

    if (e && 'key' in e && e.key === 'Escape' && this.isVisibile()) {
      e.stopPropagation();

      this.hide();
    }

    if ('button' in e && e.button === 0 && this.isVisibile() && !this._isHover) {
      e.stopPropagation();

      this.hide();
    }
  }

  private clearTimer(): void {
    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
    }
  }

  private startTimer(): void {
    this.clearTimer();

    this._hideTimer = setTimeout(() => this.hide(), this._hidePopupDelay);
  }

  //#endregion
}
