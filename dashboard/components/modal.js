const overlay = () => document.getElementById('modal-overlay');
const titleEl = () => document.getElementById('modal-title');
const bodyEl = () => document.getElementById('modal-body');
const closeBtn = () => document.getElementById('modal-close');

let initialized = false;

function init() {
  if (initialized) return;
  initialized = true;

  closeBtn().addEventListener('click', close);
  overlay().addEventListener('click', (e) => {
    if (e.target === overlay()) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}

export function open(title, contentHtml, onSubmit) {
  init();
  titleEl().textContent = title;
  bodyEl().innerHTML = contentHtml;
  overlay().classList.remove('hidden');

  if (onSubmit) {
    const form = bodyEl().querySelector('form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        const success = await onSubmit(data);
        if (success !== false) close();
      });
    }
  }
}

export function close() {
  overlay().classList.add('hidden');
  bodyEl().innerHTML = '';
}
