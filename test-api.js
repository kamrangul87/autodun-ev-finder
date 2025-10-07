fetch('https://autodun-ev-finder-u6oz2nc2v-autodun-ev-finders-projects.vercel.app/api/stations?bbox=-0.5,51.3,0.3,51.7')
  .then(r => r.json())
  .then(d => console.log(JSON.stringify(d, null, 2)))
  .catch(e => console.error(e));
