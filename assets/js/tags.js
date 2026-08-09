(() => {
    const directory = document.querySelector("[data-tag-directory]");
    if (!directory) return;

    const input = directory.querySelector("#tag-search");
    const groupsContainer = directory.querySelector("[data-tag-groups]");
    const countList = directory.querySelector("[data-tag-count-list]");
    const groups = [...directory.querySelectorAll("[data-tag-group]")];
    const items = [...directory.querySelectorAll("[data-tag-item]")];
    const popularItems = [...directory.querySelectorAll("[data-popular-tag]")];
    const popularSection = directory.querySelector("[data-popular-tags]");
    const sortButtons = [...directory.querySelectorAll("[data-tag-sort]")];
    const resultCount = directory.querySelector("[data-tag-result-count]");
    const resultLabel = directory.querySelector("[data-tag-result-label]");
    const emptyState = directory.querySelector("[data-tag-empty]");
    const clearButton = directory.querySelector("[data-tag-clear]");
    const params = new URLSearchParams(window.location.search);
    let activeSort = params.get("sort") === "count" ? "count" : "name";

    const normalize = (value) => value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase();

    const groupLists = new Map(groups.map((group) => [
        group.dataset.tagGroup,
        group.querySelector("ul"),
    ]));

    const updateUrl = () => {
        const next = new URL(window.location.href);
        const query = input.value.trim();
        if (query) next.searchParams.set("q", query);
        else next.searchParams.delete("q");
        if (activeSort === "count") next.searchParams.set("sort", "count");
        else next.searchParams.delete("sort");
        window.history.replaceState({}, "", next);
    };

    const applySort = () => {
        if (activeSort === "count") {
            [...items]
                .sort((a, b) => Number(b.dataset.count) - Number(a.dataset.count)
                    || a.dataset.name.localeCompare(b.dataset.name))
                .forEach((item) => countList.append(item));
            groupsContainer.hidden = true;
            countList.hidden = false;
        } else {
            [...items]
                .sort((a, b) => a.dataset.name.localeCompare(b.dataset.name))
                .forEach((item) => groupLists.get(item.dataset.group).append(item));
            groupsContainer.hidden = false;
            countList.hidden = true;
        }

        sortButtons.forEach((button) => {
            button.setAttribute("aria-pressed", String(button.dataset.tagSort === activeSort));
        });
    };

    const render = () => {
        const query = normalize(input.value.trim());
        let visibleCount = 0;

        items.forEach((item) => {
            const visible = normalize(item.dataset.name).includes(query);
            item.hidden = !visible;
            if (visible) visibleCount += 1;
        });

        popularItems.forEach((item) => {
            item.hidden = !normalize(item.dataset.name).includes(query);
        });
        popularSection.hidden = !popularSection.querySelector("[data-popular-tag]:not([hidden])");

        groups.forEach((group) => {
            group.hidden = activeSort === "count" || !group.querySelector("[data-tag-item]:not([hidden])");
        });

        resultCount.textContent = String(visibleCount);
        resultLabel.textContent = visibleCount === 1 ? "tag" : "tags";
        emptyState.hidden = visibleCount !== 0;
        updateUrl();
    };

    const clear = () => {
        input.value = "";
        render();
        input.focus();
    };

    input.value = params.get("q") || "";
    input.addEventListener("input", render);
    clearButton.addEventListener("click", clear);
    sortButtons.forEach((button) => {
        button.addEventListener("click", () => {
            activeSort = button.dataset.tagSort;
            applySort();
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
            if (input.value) clear();
            else input.blur();
        }
    });

    applySort();
    render();
})();
