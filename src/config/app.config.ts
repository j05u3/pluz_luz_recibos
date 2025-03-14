export const config = {
  numeroMedidor: 205877,
  references: [
    // one (medidor: 205877)
    { date: new Date("2023-10-11"), number: 3394909 },
    { date: new Date("2023-11-13"), number: 3473215 },
    { date: new Date("2023-12-12"), number: 3551682 },
    { date: new Date("2024-01-11"), number: 3630447 },
    { date: new Date("2024-02-12"), number: 3709720 },
    { date: new Date("2024-03-12"), number: 3790710 },
    { date: new Date("2024-04-11"), number: 3871824 },
    { date: new Date("2024-05-13"), number: 3953051 },
    { date: new Date("2024-06-11"), number: 4034389 },
    { date: new Date("2024-07-11"), number: 4115905 },
    { date: new Date("2024-08-12"), number: 4197587 },
    { date: new Date("2024-09-11"), number: 4279334 },
    { date: new Date("2024-10-14"), number: 4361178 },
    { date: new Date("2024-11-12"), number: 4443046 },
    { date: new Date("2024-12-11"), number: 4525267 },

    // two (l24) (medidor: 205876)
    // { date: new Date("2023-11-13"), number: 3473214},
    // { date: new Date("2023-12-12"), number: 3551681 },
    // { date: new Date("2024-01-11"), number: 3630446 },
    // { date: new Date("2024-02-12"), number: 3709719 },
    // { date: new Date("2024-03-12"), number: 3790709 },
    // { date: new Date("2024-04-11"), number: 3871823 },
    // { date: new Date("2024-05-13"), number: 3953050 },
    // { date: new Date("2024-06-11"), number: 4034388 },
    // { date: new Date("2024-07-11"), number: 4115904 },
    // { date: new Date("2024-08-12"), number: 4197586 },
    // { date: new Date("2024-09-11"), number: 4279333 },
    // { date: new Date("2024-10-14"), number: 4361177 },
    // { date: new Date("2024-11-12"), number: 4443045 },
    // { date: new Date("2024-12-11"), number: 4525266 },
    // { date: new Date("2025-01-13"), number: 4607646 },

    // (lt 28) (medidor: 210558)
    // { date: new Date("2024-03-12"), number: 3790600},

    // medidor: 23726168
  ],
  dailyIncrement: 2620,
  monthlyIncrement: 81227,
  port: process.env.PORT || 3000,
  corsOrigin: process.env.NODE_ENV === "production"
    ? process.env.RENDER_EXTERNAL_URL || "https://pluz-luz-recibos.onrender.com"
    : "*"
}; 