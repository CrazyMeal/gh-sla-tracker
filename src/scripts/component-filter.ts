export class ComponentFilter {
    private activeFilter: string;
    private filterButtons: NodeListOf<HTMLElement>;
    private incidentCards: NodeListOf<HTMLElement>;

    constructor() {
        this.activeFilter = "all";
        this.filterButtons = document.querySelectorAll(".filter-btn");
        this.incidentCards = document.querySelectorAll(".incident-card");

        this.init();
    }

    private init() {
        // Add click handlers to filter buttons
        this.filterButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                const filter = btn.dataset.filter;
                if (filter) {
                    this.applyFilter(filter, btn);
                }
            });
        });
    }

    private applyFilter(filter: string, activeBtn: HTMLElement) {
        this.activeFilter = filter;

        // Update button states
        this.filterButtons.forEach((btn) => btn.classList.remove("active"));
        activeBtn.classList.add("active");

        // Filter incidents
        this.incidentCards.forEach((card) => {
            if (filter === "all") {
                card.style.display = "";
                return;
            }

            const components = card.dataset.components;
            const matches = this.componentMatches(components, filter);

            if (matches) {
                card.style.display = "";
            } else {
                card.style.display = "none";
            }
        });
    }

    private componentMatches(componentsString: string | undefined, targetComponent: string): boolean {
        if (!componentsString) return false;

        const components = componentsString.split("|");
        return components.some((component) => {
            // Normalize and use word boundary matching (mirrors backend logic)
            const normalized = component.trim().replace(/^and\s+/i, "");
            const pattern = new RegExp(
                `\\b${this.escapeRegex(targetComponent)}\\b`,
                "i",
            );
            return pattern.test(normalized);
        });
    }

    private escapeRegex(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
}
