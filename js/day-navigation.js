/* Shared, view-only journey navigation. Never writes project data. */
window.RodaDayNavigation = (() => {
  function create(main, { onSelect, onCompare }) {
    const bar = document.createElement('section');
    bar.id = 'dayNavigation';
    bar.className = 'dayNavigation noPrint';
    bar.setAttribute('aria-label', 'Jornada de trabajo');
    bar.dataset.roAllow = '1';
    bar.innerHTML = '<span class="dayNavigationLabel">Jornada</span><details class="dayPicker"><summary aria-label="Elegir jornada"><span class="dayPickerTitle"></span><span class="dayPickerChevron" aria-hidden="true">⌄</span></summary><div class="dayPickerMenu"><div class="dayPickerOptions"></div></div></details><span class="dayNavigationMeta"></span>';
    main.prepend(bar);
    const picker = bar.querySelector('details');
    const summary = bar.querySelector('summary');
    const title = bar.querySelector('.dayPickerTitle');
    const options = bar.querySelector('.dayPickerOptions');
    const meta = bar.querySelector('.dayNavigationMeta');
    let signature = '';
    const close = (focus = false) => { picker.open = false; if (focus) summary.focus(); };
    document.addEventListener('click', event => { if (!bar.contains(event.target)) close(); });
    bar.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); picker.open = true;
      const buttons = [...options.querySelectorAll('button')];
      const at = buttons.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : event.key === 'ArrowUp' ? (at <= 0 ? buttons.length - 1 : at - 1) : (at + 1) % buttons.length;
      buttons[next]?.focus();
    });
    function render(config) {
      bar.hidden = !config.visible;
      main.classList.toggle('hasDayNavigation', config.visible);
      document.body.classList.toggle('hasSharedDayNavigation', config.visible);
      if (!config.visible) { close(); return; }
      const nextSignature = JSON.stringify(config);
      if (nextSignature === signature) return;
      signature = nextSignature;
      const focused = options.contains(document.activeElement) ? document.activeElement.dataset.day : null;
      title.textContent = config.title;
      meta.textContent = config.meta || '';
      options.replaceChildren();
      const add = (id, label, detail, action = () => onSelect(id)) => {
        const button = document.createElement('button');
        button.type = 'button'; button.dataset.day = id;
        button.className = 'dayPickerOption';
        button.setAttribute('aria-pressed', String(id === config.selection));
        button.setAttribute('aria-label', label + (detail ? ' · ' + detail : ''));
        const text = document.createElement('span');
        const name = document.createElement('strong'); name.textContent = label; text.append(name);
        if (detail) { const small = document.createElement('small'); small.textContent = detail; text.append(small); }
        const mark = document.createElement('span'); mark.className = 'dayPickerCheck'; mark.setAttribute('aria-hidden', 'true'); mark.textContent = id === config.selection ? '✓' : '';
        button.append(text, mark);
        button.addEventListener('click', () => { close(); action(); summary.focus(); });
        options.append(button);
      };
      if (config.allowAll) add('all', 'Todas las jornadas', config.days.length + ' jornadas del proyecto');
      for (const day of config.days) add(day.id, day.title, day.detail);
      if (config.allowUnassigned) add('unassigned', 'Sin jornada asignada', 'Elementos de escenas pendientes de planificar');
      if (config.allowCompare && config.days.length) add('compare', 'Comparar jornadas…', 'Elegir varios días para el Plan General', onCompare);
      if (!options.children.length) { const empty = document.createElement('p'); empty.className = 'dayPickerEmpty'; empty.textContent = 'Creá una jornada en Plan de Rodaje para empezar.'; options.append(empty); }
      if (focused) [...options.children].find(button => button.dataset.day === focused)?.focus();
    }
    return { render };
  }
  return { create };
})();
