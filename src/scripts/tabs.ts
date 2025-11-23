export class Tabs {
    private tabList!: HTMLElement;
    private tabs!: NodeListOf<HTMLElement>;
    private panels!: NodeListOf<HTMLElement>;

    constructor(tabListSelector: string = '[role="tablist"]') {
        const list = document.querySelector<HTMLElement>(tabListSelector);
        if (!list) {
            console.warn(`Tab list not found for selector: ${tabListSelector}`);
            return;
        }
        this.tabList = list;
        this.tabs = this.tabList.querySelectorAll('[role="tab"]');
        this.panels = document.querySelectorAll('[role="tabpanel"]');

        this.init();
    }

    private init() {
        this.tabs.forEach((tab) => {
            tab.addEventListener("click", (e) => {
                const target = e.currentTarget as HTMLElement;
                this.switchTab(target);
            });

            // Keyboard navigation
            tab.addEventListener("keydown", (e) => {
                this.handleKeydown(e);
            });
        });
    }

    private switchTab(newTab: HTMLElement) {
        // Deselect all tabs
        this.tabs.forEach((tab) => {
            tab.setAttribute("aria-selected", "false");
            tab.setAttribute("tabindex", "-1");
        });

        // Hide all panels
        this.panels.forEach((panel) => {
            panel.hidden = true;
        });

        // Select new tab
        newTab.setAttribute("aria-selected", "true");
        newTab.setAttribute("tabindex", "0");
        newTab.focus();

        // Show target panel
        const controlsId = newTab.getAttribute("aria-controls");
        if (controlsId) {
            const panel = document.getElementById(controlsId);
            if (panel) {
                panel.hidden = false;
            }
        }
    }

    private handleKeydown(e: KeyboardEvent) {
        const target = e.currentTarget as HTMLElement;
        const index = Array.from(this.tabs).indexOf(target);
        let nextIndex: number | null = null;

        switch (e.key) {
            case "ArrowLeft":
                nextIndex = index - 1;
                if (nextIndex < 0) nextIndex = this.tabs.length - 1;
                break;
            case "ArrowRight":
                nextIndex = index + 1;
                if (nextIndex >= this.tabs.length) nextIndex = 0;
                break;
            case "Home":
                nextIndex = 0;
                break;
            case "End":
                nextIndex = this.tabs.length - 1;
                break;
        }

        if (nextIndex !== null) {
            e.preventDefault();
            this.switchTab(this.tabs[nextIndex]);
        }
    }
}
