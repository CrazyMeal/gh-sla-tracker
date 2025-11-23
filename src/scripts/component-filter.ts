export class ComponentFilter {
    private activeComponent: string | null;
    private componentRows: NodeListOf<HTMLElement>;
    private incidentCards: NodeListOf<HTMLElement>;
    private filterBanner: HTMLElement | null;
    private filterCountElement: HTMLElement | null;
    private filterComponentElement: HTMLElement | null;
    private clearButton: HTMLElement | null;

    constructor() {
        this.activeComponent = null;
        this.componentRows = document.querySelectorAll(".component-row");
        this.incidentCards = document.querySelectorAll(".incident-card");
        this.filterBanner = document.getElementById("component-filter-banner");
        this.filterCountElement = document.getElementById("filter-count");
        this.filterComponentElement = document.getElementById("filter-component");
        this.clearButton = document.getElementById("clear-filter");

        this.init();
    }

    private init() {
        // Add click handlers to component rows
        this.componentRows.forEach((row) => {
            row.addEventListener("click", () => this.toggleFilter(row));
            row.addEventListener("keypress", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    this.toggleFilter(row);
                }
            });
        });

        // Add click handler to clear button
        this.clearButton?.addEventListener("click", () => this.clearFilter());
    }

    private toggleFilter(row: HTMLElement) {
        const componentName = row.dataset.component;

        if (!componentName) return;

        if (this.activeComponent === componentName) {
            // Clicking same component - clear filter
            this.clearFilter();
        } else {
            // Apply new filter
            this.applyFilter(componentName, row);
        }
    }

    private applyFilter(componentName: string, row: HTMLElement) {
        this.activeComponent = componentName;

        // Update row selection state
        this.componentRows.forEach((r) => r.classList.remove("selected"));
        row.classList.add("selected");

        // Filter incidents using fuzzy matching
        let visibleCount = 0;
        this.incidentCards.forEach((card) => {
            const components = card.dataset.components;
            const matches = this.componentMatches(components, componentName);

            if (matches) {
                card.style.display = "";
                visibleCount++;
            } else {
                card.style.display = "none";
            }
        });

        // Update filter banner
        if (this.filterCountElement) this.filterCountElement.textContent = visibleCount.toString();
        if (this.filterComponentElement) this.filterComponentElement.textContent = componentName;
        if (this.filterBanner) {
            this.filterBanner.style.display = "block";

            // Scroll to incidents section smoothly
            this.filterBanner.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
            });
        }
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

    private clearFilter() {
        this.activeComponent = null;

        // Clear row selection
        this.componentRows.forEach((r) => r.classList.remove("selected"));

        // Show all incidents
        this.incidentCards.forEach((card) => {
            card.style.display = "";
        });

        // Hide filter banner
        if (this.filterBanner) {
            this.filterBanner.style.display = "none";
        }
    }
}
