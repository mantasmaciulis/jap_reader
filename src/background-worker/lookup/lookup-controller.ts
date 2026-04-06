import { addContextMenu } from '@shared/extension/add-context-menu';
import { openNewTab } from '@shared/extension/open-new-tab';
import { getCardActionProvider } from '@shared/providers/get-providers';

export class LookupController {
  constructor() {
    addContextMenu(
      {
        id: 'lookup-selection',
        title: 'Lookup selected text',
        contexts: ['selection'],
      },
      (info) => this.lookupText(info.selectionText),
    );
  }

  public lookupText(text: string | undefined): void {
    if (!text?.length) {
      return;
    }

    void getCardActionProvider().then((provider) => {
      const url = provider.getLookupUrl(text);

      void openNewTab(url);
    });
  }
}
