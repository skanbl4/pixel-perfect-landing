const blocks = [...document.querySelectorAll('.cmp')];

function layout() {
  for (const cmp of blocks) {
    const W = +cmp.dataset.w;
    const H = +cmp.dataset.h;
    const overlay = cmp.querySelector('.cmp__body').dataset.mode === 'over';

    const panes = cmp.querySelectorAll('.pane');
    const frame = cmp.querySelector('iframe');
    const host = (overlay ? panes[0] : panes[1]).querySelector('.scaler');
    if (frame.parentElement !== host) host.append(frame);

    for (const scaler of cmp.querySelectorAll('.scaler')) {
      const avail = scaler.parentElement.clientWidth;
      if (!avail) continue;
      const k = Math.min(avail / W, 1);
      scaler.style.height = Math.round(H * k) + 'px';
      for (const inner of scaler.children) {
        inner.style.transform = `scale(${k})`;
        inner.style.width = W + 'px';
        inner.style.height = H + 'px';
      }
    }
  }
}

for (const cmp of blocks) {
  const body = cmp.querySelector('.cmp__body');
  const fade = cmp.querySelector('.fade');
  const range = fade.querySelector('input');

  cmp.querySelectorAll('.switch__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      cmp.querySelectorAll('.switch__btn').forEach(b => b.classList.toggle('is-on', b === btn));
      body.dataset.mode = btn.dataset.mode;
      fade.hidden = btn.dataset.mode !== 'over';
      layout();
      if (btn.dataset.mode === 'over') applyFade(cmp, range.value);
      else cmp.querySelector('iframe').style.opacity = '';
    });
  });

  range.addEventListener('input', () => applyFade(cmp, range.value));
}

function applyFade(cmp, v) {
  cmp.querySelector('iframe').style.opacity = v / 100;
}

addEventListener('resize', layout);
addEventListener('load', layout);
layout();
