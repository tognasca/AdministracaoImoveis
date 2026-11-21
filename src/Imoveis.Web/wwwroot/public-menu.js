export function bindPublicMenu() {
  const menuToggle = document.querySelector('#public-menu-toggle');
  const publicHeader = menuToggle.closest('header');
  function setPublicMenu(expanded) {
    publicHeader.classList.toggle('menu-open', expanded);
    menuToggle.setAttribute('aria-expanded', String(expanded));
  }
  menuToggle.onclick = () => setPublicMenu(menuToggle.getAttribute('aria-expanded') !== 'true');
  publicHeader.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || menuToggle.getAttribute('aria-expanded') !== 'true') return;
    setPublicMenu(false);
    menuToggle.focus();
  });
  document.querySelector('#public-menu').addEventListener('click', event => {
    if (!event.target.closest('a') || menuToggle.getAttribute('aria-expanded') !== 'true') return;
    setPublicMenu(false);
    menuToggle.focus();
  });
  return setPublicMenu;
}
