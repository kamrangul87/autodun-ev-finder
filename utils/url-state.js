// utils/url-state.js
export function getStateFromURL() {
  if (typeof window === 'undefined') return getDefaultState();
  const params = new URLSearchParams(window.location.search);
  return {
    heat: params.get('heat') === '1',
    markers: params.get('markers') === '1',
    council: params.get('council') === '1',
    query: params.get('q') || ''
  };
}

export function updateURL(state, replace = false) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams();
  if (state.heat) params.set('heat', '1');
  if (state.markers) params.set('markers', '1');
  if (state.council) params.set('council', '1');
  if (state.query) params.set('q', state.query);
  const newURL = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
  if (replace) {
    window.history.replaceState({}, '', newURL);
  } else {
    window.history.pushState({}, '', newURL);
  }
}

export function getDefaultState() {
  return { heat: false, markers: true, council: false, query: '' };
}

export function getInitialState() {
  const urlState = getStateFromURL();
  const defaults = getDefaultState();
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  if (params.toString() === '') return defaults;
  return { ...defaults, ...urlState };
}
