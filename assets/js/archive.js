(() => {
    const archive = document.querySelector("[data-archive]");
    if (!archive) return;

    const input = archive.querySelector("#archive-search");
    const clearButton = archive.querySelector("[data-clear-search]");
    const emptyClearButton = archive.querySelector("[data-empty-clear]");
    const filterButtons = [...archive.querySelectorAll("[data-archive-filter]")];
    const items = [...archive.querySelectorAll("[data-archive-item]")];
    const years = [...archive.querySelectorAll("[data-archive-year]")];
    const resultCount = archive.querySelector("[data-result-count]");
    const resultLabel = archive.querySelector("[data-result-label]");
    const emptyState = archive.querySelector("[data-archive-empty]");
    const params = new URLSearchParams(window.location.search);
    const validKinds = new Set(["all", "article", "note"]);
    let activeKind = validKinds.has(params.get("type")) ? params.get("type") : "all";

    const normalize = (value) => value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase();

    const searchableItems = items.map((item) => ({
        element: item,
        kind: item.dataset.kind,
        search: normalize(item.dataset.search || ""),
    }));

    const updateUrl = () => {
        const next = new URL(window.location.href);
        const query = input.value.trim();
        if (query) next.searchParams.set("q", query);
        else next.searchParams.delete("q");
        if (activeKind !== "all") next.searchParams.set("type", activeKind);
        else next.searchParams.delete("type");
        window.history.replaceState({}, "", next);
    };

    const render = () => {
        const query = normalize(input.value.trim());
        const terms = query.split(/\s+/).filter(Boolean);
        let visibleCount = 0;

        searchableItems.forEach(({ element, kind, search }) => {
            const matchesKind = activeKind === "all" || kind === activeKind;
            const matchesQuery = terms.every((term) => search.includes(term));
            const visible = matchesKind && matchesQuery;
            element.hidden = !visible;
            if (visible) visibleCount += 1;
        });

        years.forEach((year) => {
            year.hidden = !year.querySelector("[data-archive-item]:not([hidden])");
        });

        filterButtons.forEach((button) => {
            button.setAttribute("aria-pressed", String(button.dataset.archiveFilter === activeKind));
        });
        clearButton.hidden = !input.value && activeKind === "all";
        emptyState.hidden = visibleCount !== 0;
        resultCount.textContent = String(visibleCount);
        resultLabel.textContent = visibleCount === 1 ? "entry" : "entries";
        updateUrl();
    };

    const clear = () => {
        input.value = "";
        activeKind = "all";
        render();
        input.focus();
    };

    input.value = params.get("q") || "";
    input.addEventListener("input", render);
    clearButton.addEventListener("click", clear);
    emptyClearButton.addEventListener("click", clear);
    filterButtons.forEach((button) => {
        button.addEventListener("click", () => {
            activeKind = button.dataset.archiveFilter;
            render();
        });
    });

    document.addEventListener("keydown", (event) => {
        const target = event.target;
        const isEditable = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable;
        if (event.key === "/" && !isEditable && !event.metaKey && !event.ctrlKey && !event.altKey) {
            event.preventDefault();
            input.focus();
        }
        if (event.key === "Escape" && document.activeElement === input) {
            if (input.value || activeKind !== "all") clear();
            else input.blur();
        }
    });

    render();
    if (window.location.hash === "#search") requestAnimationFrame(() => input.focus());
})();
