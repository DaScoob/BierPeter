# Host-Tests

Der native Test kompiliert denselben Spielkern wie die Firmware. Keine ESP-Simulation wird als physischer Gerätetest ausgegeben.

```bash
cd ~/BierPeter
g++ -std=c++17 -Wall -Wextra -Werror -fsanitize=undefined -I firmware/include firmware/test/game.cpp -o /tmp/bierpeter-game-test
/tmp/bierpeter-game-test
```

20.000 Runs, bis zu acht Geräte, beide Seiten, 3–15 Sekunden pro virtueller Einzelmessung. Zusätzlich: Messung unter drei Sekunden, kein Timeout, doppelte Abschlüsse, Übergabezeiten.
