# Strativarious: guida per chi dipinge

Strativarious prende la foto di un acquerello e lo scompone nelle velature di colore, mostrandole in 3D:
si possono separare, riprodurre in ordine e guardare un pigmento alla volta.

Funziona tutto nel browser del telefono: **niente viene caricato da nessuna parte**.

*Traduzione italiana di [GUIDE.md](GUIDE.md).*

## 1. Apri e installa

1. Apri **https://tcsenpai.github.io/strativarious/**.
2. L'app parte in inglese: la lingua si cambia in alto a destra e resta salvata.
3. Installala: su Android tocca **Installa l'app**; su iPhone **Condividi → Aggiungi alla schermata Home**.
   Da installata funziona anche senza internet.
4. Vuoi vedere subito come funziona? Tocca **✨ Prova con il dipinto demo**.

## 2. La calibrazione (una volta sola, circa 15 minuti più l'asciugatura)

Serve perché lo strumento impari i **tuoi** colori. Nel frattempo puoi usare le **tavolozze di esempio**
(triade, primari doppi, paesaggio, ritratto, set da studente): colori tipici di pigmenti comuni, utili per provare.
Se non corrispondono ai tuoi colori, con **+ Combina colori** ne crei una con i soli pigmenti che possiedi.

**Prepara il foglio**
- Prendi un pezzo della **stessa carta** che usi per dipingere.
- A matita, traccia una griglia di **4 colonne** e **una riga per ogni pigmento** che usi davvero
  (da 6 a 10 va benissimo, al massimo 12). Quadretti di 2-3 cm.

**Dipingi**

| colonna 1 | colonna 2 | colonna 3 | colonna 4 |
|---|---|---|---|
| **vuota** (solo carta) | **pieno**: poca acqua, colore intenso | **medio** | **molto diluito**: appena colorato |

- Un pigmento **puro** per riga, mai mescolato. Scrivi a matita il nome accanto alla riga.
- **Lascia asciugare del tutto**: da bagnato il colore è più scuro.

**Fotografa**
- Vicino a una finestra, luce del giorno **indiretta**: niente sole diretto, flash o lampade gialle.
- Telefono **parallelo** al foglio, griglia intera nell'inquadratura, nessuna ombra.
- Usa **sempre lo stesso posto e la stessa luce**, anche per le foto dei dipinti.

**Nell'app**
1. Tocca **Calibra** (o **+ Nuova calibrazione**), scrivi quante righe hai fatto e scegli la foto.
2. Tocca i **4 angoli esterni** della griglia nell'ordine richiesto. Mentre tieni il dito compare una lente.
   I punti si possono trascinare.
3. I **quadratini bianchi** devono cadere dentro le caselle. Se compare un ⚠, sposta un angolo.
4. Scrivi i nomi dei pigmenti e tocca **Salva tavolozza**.

## 3. Scomporre un dipinto

1. Fotografa il dipinto **asciutto**, con la stessa luce della calibrazione, lasciando nell'inquadratura
   **un po' di carta non dipinta** (il bordo): da lì lo strumento capisce il colore della carta.
2. Tocca **📷 Scatta o scegli la foto del dipinto**, dai un titolo, scegli la tavolozza.
3. **Togli la spunta ai pigmenti che non hai usato.** È il consiglio più importante: con meno pigmenti
   gli strati sono molto più affidabili.
4. Tocca **Scomponi in strati**. Dopo qualche secondo si apre la vista 3D.

## 4. Nella vista 3D

| cosa | come |
|---|---|
| Riprodurre le velature in ordine | **▶ Riproduci** |
| Andare avanti e indietro | slider **Velature applicate** |
| Separare o riunire gli strati | **Fronte** / **3D**, o lo slider **Separa gli strati** |
| Confrontare con la foto vera | slider **Confronta con l'originale** |
| Vedere un pigmento da solo | tocca il suo nome (tocca di nuovo per tornare) |
| Nascondere un pigmento | 👁 |
| Ruotare / zoom | trascina col dito / pizzica |
| Tenersi un'immagine | **Salva immagine** |
| Mandarlo a qualcuno | **Scarica come HTML**: un file che si apre ovunque, anche senza internet |

## 5. Dipinti e tavolozze

- Sotto ogni dipinto: **↻** lo riscompone con un'altra tavolozza (crea un nuovo dipinto da confrontare),
  **🗑** lo elimina.
- Accanto a una tavolozza: **⤓** la esporta in un file, **🗑** la elimina (i dipinti già fatti restano).
- **Importa tavolozza**: per usare su un altro dispositivo una tavolozza esportata.
- **+ Combina colori**: crea una tavolozza scegliendo pigmenti da quelle calibrate, senza dipingere
  una nuova griglia. È segnata come *sintetica*: i colori vengono da calibrazioni diverse, quindi il
  risultato è meno affidabile.
- Tutto resta in questo browser. Se cancelli i dati del sito li perdi: esporta le tavolozze che ti servono.

## Cosa aspettarsi, onestamente

- Lo strumento propone **una** sequenza di velature che ricrea il dipinto con i tuoi pigmenti, non
  necessariamente quella che hai seguito: lo stesso verde può venire da giallo sopra blu o da blu sopra giallo.
- L'ordine segue la regola classica: prima le campiture chiare e larghe, poi i dettagli scuri.
- Funziona meglio con **velature pulite**. Bagnato su bagnato, fioriture e granulazione non sono veri
  strati: vengono interpretati come velature.
- Nelle zone molto diluite gli strati possono sembrare "granulosi": più miscele spiegano lo stesso colore.

## Se qualcosa non va

| problema | soluzione |
|---|---|
| Colori tutti spostati (troppo gialli o troppo blu), o un ⚠ sulla carta nel viewer | nella foto manca carta non dipinta, o la luce è diversa da quella della calibrazione |
| ⚠ in calibrazione | sposta gli angoli; se resta, la casella "carta" non è vuota o il pieno è più chiaro del medio |
| Un pigmento compare dappertutto | togli la spunta ai pigmenti che non hai usato |
| Dopo un aggiornamento vedi la versione vecchia | chiudi e riapri l'app |
