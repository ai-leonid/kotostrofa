export interface NewspaperData {
  score: number
  broken: number
  dishes: number
  maxCombo: number
  roomsDone: number
  roomsTotal: number
  rankName: string
  rankDesc: string
  speedBonus: number
  win: boolean
  topEvents: { label: string; pts: number }[]
  brokenTV?: boolean
  brokenAquarium?: boolean
  fallenCurtains?: boolean
  brokenVacuum?: boolean
}

function fmt(n: number): string {
  return (n || 0).toLocaleString('ru-RU')
}

export function drawNewspaper(
  canvas: HTMLCanvasElement,
  data: NewspaperData,
  glSource?: HTMLCanvasElement | null
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const W = canvas.width
  const H = canvas.height

  // 1. Винтажный состаренный фон газетного листа
  ctx.fillStyle = '#f4eee3'
  ctx.fillRect(0, 0, W, H)

  // Тонкие волокна бумаги
  ctx.fillStyle = 'rgba(0, 0, 0, 0.03)'
  for (let i = 0; i < 300; i++) {
    const rx = (Math.sin(i * 127.1) * 0.5 + 0.5) * W
    const ry = (Math.cos(i * 311.7) * 0.5 + 0.5) * H
    ctx.fillRect(rx, ry, (i % 3) + 1, (i % 2) + 1)
  }

  // 2. Двойная черная рамка полосы
  ctx.strokeStyle = '#222222'
  ctx.lineWidth = 3
  ctx.strokeRect(8, 8, W - 16, H - 16)
  ctx.lineWidth = 1
  ctx.strokeRect(13, 13, W - 26, H - 26)

  // Угловые акценты (винтажные уголки)
  const cOff = 16
  const cLen = 14
  ctx.lineWidth = 2
  ;[[cOff, cOff], [W - cOff, cOff], [cOff, H - cOff], [W - cOff, H - cOff]].forEach(([cx, cy], idx) => {
    ctx.beginPath()
    const sx = idx % 2 === 0 ? 1 : -1
    const sy = idx < 2 ? 1 : -1
    ctx.moveTo(cx, cy + sy * cLen)
    ctx.lineTo(cx, cy)
    ctx.lineTo(cx + sx * cLen, cy)
    ctx.stroke()
  })

  // 3. Шапка газеты (Masthead)
  ctx.fillStyle = '#222222'
  ctx.font = 'bold 10px monospace, monospace'
  ctx.textAlign = 'center'
  ctx.fillText('ЭКСТРЕННЫЙ ВЫПУСК № 1 • ГОРОДСКАЯ ХРОНИКА ПРОИСШЕСТВИЙ • ЦЕНА: 5 КОПЕЕК', W / 2, 28)

  // Линия под верхней плашкой
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(18, 33)
  ctx.lineTo(W - 18, 33)
  ctx.stroke()

  // Главное название газеты
  ctx.font = '900 44px Georgia, serif'
  ctx.fillText('В Е Ч Е Р Н И Й   Х А О С', W / 2, 74)

  // Подзаголовок выпуска
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(18, 82)
  ctx.lineTo(W - 18, 82)
  ctx.stroke()

  ctx.font = 'bold 11px sans-serif'
  const dateStr = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  ctx.fillText(
    `МОСКВА • ${dateStr.toUpperCase()} • СУММА УЩЕРБА: ${fmt(data.score)} ₽ • СИНДИКАТ В ВОСТОРГЕ`,
    W / 2,
    96
  )

  ctx.beginPath()
  ctx.moveTo(18, 102)
  ctx.lineTo(W - 18, 102)
  ctx.stroke()

  // 4. Сенсационный заголовок
  let headline = 'ОДИНОКИЙ ДИВЕРСАНТ: ОСТАВЛЕННЫЙ БЕЗ ПРИСМОТРА КОТ РАЗНЕС КВАРТИРУ!'
  if (data.brokenTV) {
    headline = 'ШОК! ТЕЛЕВИЗОР ПОВЕРЖЕН, КОТ НЕ ПРИЗНАЕТ СВОЮ ВИНУ!'
  } else if (data.brokenAquarium) {
    headline = 'ВОДНЫЙ КОЛЛАПС: АКВАРИУМ В ДРЕБЕЗГИ, ЗОЛОТАЯ РЫБКА В РОЗЫСКЕ!'
  } else if (data.brokenVacuum) {
    headline = 'ВОССТАНИЕ МАШИН ПОДАВЛЕНО: РОБОТ «ЖОРКА-3000» ОТПРАВЛЕН В НОКАУТ!'
  } else if (data.fallenCurtains) {
    headline = 'ДЕРЗКИЙ НАЛЕТ НА КАРНИЗЫ: ШТОРЫ СОМЯТЫ В КЛОЧЬЯ НА ПАРКЕТЕ!'
  } else if (data.score >= 35000) {
    headline = 'КАТАСТРОФА ГОДА: КВАРТИРА ПРЕВРАЩЕНА В РУИНЫ ЗА СЧИТАННЫЕ МИНУТЫ!'
  }

  const headlineText = `«${headline}»`
  let headlineFontSize = 16
  ctx.font = `italic 800 ${headlineFontSize}px Georgia, serif`
  while (ctx.measureText(headlineText).width > W - 64 && headlineFontSize > 10.5) {
    headlineFontSize -= 0.5
    ctx.font = `italic 800 ${headlineFontSize}px Georgia, serif`
  }
  ctx.textAlign = 'center'
  ctx.fillText(headlineText, W / 2, 120)

  // Разделитель между шапкой и колонками
  ctx.beginPath()
  ctx.moveTo(18, 131)
  ctx.lineTo(W - 18, 131)
  ctx.stroke()

  // 5. Левая колонка — ФОТО С МЕСТА ПРЕСТУПЛЕНИЯ
  const photoX = 24
  const photoY = 144
  const photoW = 340
  const photoH = 220

  if (glSource && glSource.width > 0 && glSource.height > 0) {
    try {
      ctx.drawImage(glSource, 0, 0, glSource.width, glSource.height, photoX, photoY, photoW, photoH)
      // Эффект газетной фотопечати (сепия-монохром + полутона)
      ctx.fillStyle = 'rgba(40, 25, 10, 0.28)'
      ctx.fillRect(photoX, photoY, photoW, photoH)
      // Горизонтальные строки растра
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)'
      for (let y = photoY; y < photoY + photoH; y += 3) {
        ctx.fillRect(photoX, y, photoW, 1)
      }
    } catch (e) {
      drawPhotoFallback(ctx, photoX, photoY, photoW, photoH)
    }
  } else {
    drawPhotoFallback(ctx, photoX, photoY, photoW, photoH)
  }

  // Рамка фото
  ctx.strokeStyle = '#111111'
  ctx.lineWidth = 1.5
  ctx.strokeRect(photoX, photoY, photoW, photoH)

  // Подпись к фото
  ctx.font = 'italic 10px sans-serif'
  ctx.fillStyle = '#444'
  ctx.textAlign = 'left'
  ctx.fillText('Кадр с камеры скрытого наблюдения: главный подозреваемый на месте катастрофы', photoX, photoY + photoH + 14)

  // 6. Правая колонка — СВОДКА И ХРОНИКА
  const colX = 385
  const colY = 144
  const colW = W - colX - 24

  ctx.textAlign = 'left'
  ctx.fillStyle = '#111'
  ctx.font = 'bold 13px sans-serif'
  ctx.fillText('ХРОНИКА РАЗРУШЕНИЙ В КВАРТИРЕ:', colX, colY + 12)

  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(colX, colY + 18)
  ctx.lineTo(colX + colW, colY + 18)
  ctx.stroke()

  ctx.font = '12px sans-serif'
  ctx.fillStyle = '#222'
  let curY = colY + 36
  const events = data.topEvents || []
  if (events.length > 0) {
    events.slice(0, 4).forEach((ev) => {
      ctx.fillText(`• ${ev.label}: +${fmt(ev.pts)} ₽`, colX, curY)
      curY += 20
    })
  } else {
    ctx.fillText('• Следы когтей на диване и коврах', colX, curY)
    curY += 20
  }

  curY += 4
  ctx.font = 'bold 11px sans-serif'
  ctx.fillText(`РАЗБИТО: ${data.broken} предметов (посуды: ${data.dishes})`, colX, curY)
  curY += 16
  ctx.fillText(`СЕРИЯ КОМБО: ×${data.maxCombo} подряд • КОМНАТ: ${data.roomsDone} из ${data.roomsTotal}`, colX, curY)
  curY += 16

  if (data.speedBonus > 0) {
    ctx.fillStyle = '#b45309'
    ctx.fillText(`ПРЕМИЯ СИНДИКАТА ЗА СКОРОСТЬ: +${fmt(data.speedBonus)} ₽`, colX, curY)
    curY += 18
  }

  // Карточка вердикта и ранга
  ctx.fillStyle = '#ebdccb'
  ctx.fillRect(colX, curY, colW, 64)
  ctx.strokeStyle = '#333'
  ctx.lineWidth = 1
  ctx.strokeRect(colX, curY, colW, 64)

  ctx.fillStyle = '#111'
  ctx.font = 'bold 12px sans-serif'
  ctx.fillText(`ВЕРДИКТ СИНДИКАТА: Ранг «${data.rankName}»`, colX + 8, curY + 20)
  ctx.font = 'italic 11px sans-serif'
  ctx.fillStyle = '#333'
  ctx.fillText(data.rankDesc || 'Мастер домашних катастроф.', colX + 8, curY + 40, colW - 16)

  // 7. Красный штамп (Stamp)
  ctx.save()
  ctx.translate(colX + colW - 85, H - 75)
  ctx.rotate(-0.18)
  ctx.strokeStyle = '#b91c1c'
  ctx.fillStyle = '#b91c1c'
  ctx.lineWidth = 2.5
  ctx.strokeRect(-75, -24, 150, 48)
  ctx.lineWidth = 1
  ctx.strokeRect(-71, -20, 142, 40)
  ctx.font = '900 14px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(data.win ? 'ПОЛНЫЙ РАЗГРОМ' : 'РАЗЫСКИВАЕТСЯ', 0, -4)
  ctx.font = 'bold 10px sans-serif'
  ctx.fillText(data.win ? 'ДЕЛО ЗАКРЫТО' : 'ВИНОВЕН: 100%', 0, 12)
  ctx.restore()

  // 8. Нижняя цитата / примечание
  ctx.lineWidth = 1
  ctx.strokeStyle = '#222'
  ctx.beginPath()
  ctx.moveTo(18, H - 38)
  ctx.lineTo(W - 18, H - 38)
  ctx.stroke()

  ctx.font = 'italic 10px sans-serif'
  ctx.fillStyle = '#555'
  ctx.textAlign = 'center'
  ctx.fillText(
    'ВНИМАНИЕ: При обнаружении рыжего кота с лапой-лассо сохраняйте спокойствие, выдайте лакомство и не злите!',
    W / 2,
    H - 24
  )
}

function drawPhotoFallback(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#dcd4c6'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = '#555'
  ctx.font = 'bold 14px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('🐱 МЕСТО ПРЕСТУПЛЕНИЯ', x + w / 2, y + h / 2 - 10)
  ctx.font = 'italic 11px sans-serif'
  ctx.fillText('(=^･ω･^=) «Я просто смотрел на птичку»', x + w / 2, y + h / 2 + 14)
}
