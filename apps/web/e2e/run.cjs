// Bütün uçtan uca deneme takımlarını tek derlemeyle sırayla koşar (apps/web içinde): pnpm e2e
require('./harness.cjs').main([require('./uyelik.cjs'), require('./yonetim.cjs')]);
