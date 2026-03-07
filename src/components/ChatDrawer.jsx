// src/components/ChatDrawer.jsx
import { useState, useRef, useEffect } from 'react'
import { X, Send, Bot, Calendar as CalendarIcon, Beaker, FlaskConical, Bell, Trash2 } from 'lucide-react'
import { db } from '../firebase'
import { collection, query, where, getDocs, addDoc, serverTimestamp, getDoc, doc, updateDoc, orderBy, onSnapshot, limit, writeBatch, deleteDoc } from 'firebase/firestore'
import { useAuthStore } from '../store/authStore'
import { GoogleGenerativeAI } from '@google/generative-ai'
import toast from 'react-hot-toast'
import { parseISO, format, isValid } from 'date-fns'
import { es } from 'date-fns/locale'
import { addAuditLog } from '../hooks/useAuth'

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
if (!GEMINI_KEY) {
    console.error("GEMINI API KEY NOT CONFIGURED. Please set VITE_GEMINI_API_KEY in your .env file.");
}

const QUICK_ACTIONS = [
    "¿Qué equipos hay libres?",
    "¿Cuándo es mi próxima reserva?",
    "¿Qué reactivos están críticos?",
    "Hacer una reserva"
]

export default function ChatDrawer({ isOpen, onClose }) {
    const { user, userProfile } = useAuthStore()
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [pendingConfirmation, setPendingConfirmation] = useState(null)
    const messagesEndRef = useRef(null)
    const genAI = useRef(null)

    const firstName = userProfile?.firstName || user?.displayName?.split(' ')[0] || 'Investigador'

    // Initialize Gemini
    useEffect(() => {
        if (!GEMINI_KEY) return;
        try { genAI.current = new GoogleGenerativeAI(GEMINI_KEY) }
        catch (e) { console.error('Error initializing Gemini:', e) }
    }, [])

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, loading])



    // Load initial greeting and history from Firestore
    useEffect(() => {
        if (!user || !isOpen) return

        const q = query(
            collection(db, 'chat_history', user.uid, 'messages'),
            orderBy('createdAt', 'desc'),
            limit(30)
        )

        const unsub = onSnapshot(q, (snap) => {
            if (snap.empty) {
                setMessages([{
                    id: 'greeting',
                    sender: 'bot',
                    text: `¡Hola ${firstName}! 🧬\nSoy Glia, tu asistente inteligente de laboratorio. ¿En qué te puedo ayudar hoy?`,
                    time: new Date()
                }])
            } else {
                const msgs = snap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    time: doc.data().createdAt?.toDate() || new Date()
                })).reverse()
                setMessages(msgs)
            }
        })

        return () => unsub()
    }, [isOpen, user, firstName])

    // Gather Live Context (Expanded as requested)
    const gatherLabContext = async () => {
        if (!user) return {}

        const now = new Date()
        const todayStr = now.toISOString().split('T')[0]

        try {
            // 1. All three group inventories
            const neuroSnap = await getDocs(collection(db, 'inventory', 'Neurobioquímica', 'reagents'))
            const bioSnap = await getDocs(collection(db, 'inventory', 'Bioquímica', 'reagents'))
            const nutriSnap = await getDocs(collection(db, 'inventory', 'Nutrición', 'reagents'))

            const inventory = {
                neurobioquimica: neuroSnap.docs.map(d => ({ id: d.id, ...d.data() })),
                bioquimica: bioSnap.docs.map(d => ({ id: d.id, ...d.data() })),
                nutricion: nutriSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            }

            // 2. All Equipment with full details
            const equipSnap = await getDocs(collection(db, 'equipment'))
            const equipment = equipSnap.docs.map(d => {
                const data = d.data()
                return {
                    id: d.id,
                    name: data.name,
                    status: data.status,
                    currentUserName: data.currentUserName || 'N/A',
                    requiresCertification: data.name === 'Microscopio de Fluorescencia' || data.name === 'Termociclador PCR' || data.requiresCertification === true,
                    nextMaintenanceDate: data.nextMaintenanceDate || 'N/A',
                    condition: data.condition || 'bueno'
                }
            })

            // 3. All Users
            const userSnap = await getDocs(collection(db, 'users'))
            const users = userSnap.docs.map(d => {
                const data = d.data()
                return {
                    name: `${data.firstName} ${data.lastName}`,
                    role: data.role,
                    group: data.group,
                    certifications: data.certifications || [],
                    points: data.points || 0
                }
            })

            // 4. Today's Reservations (Full lab)
            const todaySnap = await getDocs(query(collection(db, 'reservations'), where('date', '==', todayStr), where('status', '==', 'confirmed')))
            const todayReservations = todaySnap.docs.map(d => {
                const data = d.data()
                return { equipmentName: data.equipmentName, userName: data.userName, startTime: data.startTime, endTime: data.endTime }
            })

            // 5. User's Upcoming Reservations (Next 5)
            const myResSnap = await getDocs(query(
                collection(db, 'reservations'),
                where('userId', '==', user.uid),
                where('date', '>=', todayStr),
                orderBy('date', 'asc'),
                limit(5)
            ))
            const myReservations = myResSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.status === 'confirmed')

            // 6. Active Projects
            const projSnap = await getDocs(collection(db, 'projects'))
            const projects = projSnap.docs.map(d => {
                const data = d.data()
                return { name: data.name, owner: data.ownerName || data.ownerId, collaborators: data.collaborators?.map(c => c.name) || [], status: data.status }
            }).filter(p => p.status === 'Activo')

            // 7. Recent Unresolved Damage Reports
            const damageSnap = await getDocs(query(collection(db, 'damage_reports'), where('status', '==', 'reported'), limit(5)))
            const damageReports = damageSnap.docs.map(d => {
                const data = d.data()
                return { equipmentName: data.equipmentName, description: data.description, severity: data.severity, reportedBy: data.userName }
            })

            // 8. Animal Availability
            const availSnap = await getDocs(query(collection(db, 'animal_availability'), where('active', '==', true)))
            const animalAvailability = availSnap.docs.map(d => ({ species: d.data().species, quantity: d.data().quantity, notes: d.data().notes }))

            return {
                currentUser: {
                    name: `${userProfile?.firstName} ${userProfile?.lastName}`,
                    role: userProfile?.role || 'user',
                    group: userProfile?.group || 'N/A',
                    points: userProfile?.points || 0,
                    level: userProfile?.level || 'Novato',
                    certifications: userProfile?.certifications || []
                },
                inventory,
                equipment,
                users,
                todayReservations,
                myReservations,
                projects,
                damageReports,
                animalAvailability
            }
        } catch (err) {
            console.error('Error gathering context:', err)
            return { error: 'Context gathering failed' }
        }
    }



    // Action Executors
    // Delete malformed document as requested
    useEffect(() => {
        deleteDoc(doc(db, 'inventory', 'MNdhlhmJHPTVWfVV06ZL')).catch(() => { })
    }, [])

    const executeAction = async (actionData) => {
        setLoading(true)
        let shouldClearPending = true
        try {
            if (actionData.type === 'registerInventoryMovement') {
                const { group, reagentName, movementType, quantity, unit, notes, confirmedCreation } = actionData.params

                // 2. Exact group string normalization (Bulletproof)
                const rawGroupName = (group || userProfile?.group || '').trim().toLowerCase()
                let groupName = 'Neurobioquímica' // default fallback if nothing matches
                if (rawGroupName.includes('nutri')) groupName = 'Nutrición'
                else if (rawGroupName.includes('bioq') && !rawGroupName.includes('neuro')) groupName = 'Bioquímica'
                else if (rawGroupName.includes('neuro')) groupName = 'Neurobioquímica'

                // Format reagent name (e.g., hipoclorito -> Hipoclorito)
                const trimmedName = (reagentName || '').trim()
                const formattedName = trimmedName.charAt(0).toUpperCase() + trimmedName.slice(1).toLowerCase()

                let invSnap;
                try {
                    invSnap = await getDocs(collection(db, 'inventory', groupName, 'reagents'))
                } catch (e) {
                    console.error("Firestore Error reading inventory:", e)
                    throw new Error(`Error al leer el inventario de ${groupName}. Revisa permisos.`)
                }

                // Verify exact match ignoring case on client side
                const matches = invSnap.docs.filter(d => d.data().name?.toLowerCase().trim() === formattedName.toLowerCase())

                if (matches.length === 0) {
                    if (movementType === 'exit') {
                        throw new Error(`El reactivo **${reagentName}** no existe en **${groupName}**. No se puede retirar.`)
                    }
                    // Auto-Create if it's an entry without double-prompting
                    try {
                        const newReagent = {
                            name: formattedName,
                            category: "Otros",
                            quantity: Math.abs(quantity),
                            unit: unit || 'unidades',
                            minimumStock: 1,
                            expirationDate: null,
                            location: "",
                            status: "ok",
                            group: groupName,
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp()
                        }
                        const newDoc = await addDoc(collection(db, 'inventory', groupName, 'reagents'), newReagent)

                        await addDoc(collection(db, 'inventory_movements'), {
                            reagentId: newDoc.id,
                            reagentName: formattedName,
                            group: groupName,
                            type: 'entry',
                            quantity: Math.abs(quantity),
                            unit: unit || 'unidades',
                            userId: user.uid,
                            userName: `${userProfile?.firstName} ${userProfile?.lastName}`,
                            notes: notes || 'Creación automática vía Glia',
                            createdAt: serverTimestamp()
                        })

                        const msg = `✅ **${reagentName}** creado y agregado al inventario de **${groupName}** — ${quantity} ${unit || ''}.`
                        await addDoc(collection(db, 'chat_history', user.uid, 'messages'), { sender: 'bot', text: msg, createdAt: serverTimestamp() })
                    } catch (err) {
                        console.error('Firestore Error creating reagent/movement:', err)
                        throw new Error('No se pudo guardar la creación en la base de datos.')
                    }
                } else {
                    // Update EXISTING (Self-Healing Duplicates)
                    let totalExistingQuantity = 0;
                    matches.forEach(m => totalExistingQuantity += (m.data().quantity || 0));

                    const mainDoc = matches[0]
                    const reagentId = mainDoc.id
                    const amount = movementType === 'exit' ? -Math.abs(quantity) : Math.abs(quantity)
                    const newTotal = totalExistingQuantity + amount

                    if (newTotal < 0) throw new Error(`Stock insuficiente. Quedan ${totalExistingQuantity} ${mainDoc.data().unit || unit}.`)

                    try {
                        // 1. Update the primary document with the merged total
                        await updateDoc(doc(db, 'inventory', groupName, 'reagents', reagentId), {
                            quantity: newTotal,
                            updatedAt: serverTimestamp()
                        })

                        // 2. Delete the extra duplicate documents
                        if (matches.length > 1) {
                            const batch = writeBatch(db);
                            matches.slice(1).forEach(m => batch.delete(m.ref));
                            await batch.commit();
                            console.log(`Consolidated ${matches.length} duplicates for ${formattedName}`);
                        }

                        await addDoc(collection(db, 'inventory_movements'), {
                            reagentId: reagentId,
                            reagentName: mainDoc.data().name,
                            group: groupName,
                            type: movementType === 'entry' ? 'entry' : 'exit',
                            quantity: Math.abs(quantity),
                            unit: mainDoc.data().unit || unit || 'unidades',
                            userId: user.uid,
                            userName: `${userProfile?.firstName} ${userProfile?.lastName}`,
                            notes: matches.length > 1 ? `Consolidación de duplicados + ${notes || 'Vía Glia'}` : (notes || 'Vía Glia JSON'),
                            createdAt: serverTimestamp()
                        })

                        const flowText = movementType === 'entry' ? 'Entrada registrada' : 'Salida registrada'
                        let successMsg = `✅ **${flowText}.** ${mainDoc.data().name} en **${groupName}**: ${newTotal} ${mainDoc.data().unit || unit}.`
                        if (matches.length > 1) successMsg += ` (Se detectaron y fusionaron ${matches.length} entradas duplicadas).`

                        await addDoc(collection(db, 'chat_history', user.uid, 'messages'), { sender: 'bot', text: successMsg, createdAt: serverTimestamp() })
                    } catch (err) {
                        console.error('Firestore Error updating reagent/movement:', err)
                        throw new Error('No se pudo actualizar el stock en la base de datos.')
                    }
                }
            } else if (actionData.type === 'moveInventory') {
                const { sourceGroup, targetGroup, reagentName, quantity, unit, notes } = actionData.params
                const normalizeGroup = (g) => {
                    const rg = (g || '').trim().toLowerCase()
                    if (rg.includes('nutri')) return 'Nutrición'
                    if (rg.includes('bioq') && !rg.includes('neuro')) return 'Bioquímica'
                    return 'Neurobioquímica'
                }
                const src = normalizeGroup(sourceGroup)
                const tgt = normalizeGroup(targetGroup)

                const trimmedName = (reagentName || '').trim()
                const formattedName = trimmedName.charAt(0).toUpperCase() + trimmedName.slice(1).toLowerCase()

                // Read Source
                const srcSnap = await getDocs(collection(db, 'inventory', src, 'reagents'))
                const srcDoc = srcSnap.docs.find(d => d.data().name?.toLowerCase().trim() === formattedName.toLowerCase())
                if (!srcDoc) throw new Error(`El reactivo **${formattedName}** no existe en **${src}**.`)

                const srcItem = srcDoc.data()
                if ((srcItem.quantity || 0) - quantity < 0) throw new Error(`Stock insuficiente en **${src}**. Quedan ${srcItem.quantity}.`)

                // Read Target
                const tgtSnap = await getDocs(collection(db, 'inventory', tgt, 'reagents'))
                const tgtDoc = tgtSnap.docs.find(d => d.data().name?.toLowerCase().trim() === formattedName.toLowerCase())

                // Process EXIT from source
                await updateDoc(doc(db, 'inventory', src, 'reagents', srcDoc.id), { quantity: (srcItem.quantity || 0) - quantity, updatedAt: serverTimestamp() })
                await addDoc(collection(db, 'inventory_movements'), {
                    reagentId: srcDoc.id, reagentName: srcItem.name, group: src, type: 'exit', quantity: Math.abs(quantity), unit: srcItem.unit || unit || 'unidades',
                    userId: user.uid, userName: `${userProfile?.firstName} ${userProfile?.lastName}`, notes: `Traslado a ${tgt}`, createdAt: serverTimestamp()
                })

                // Process ENTRY to target
                if (!tgtDoc) {
                    const newDoc = await addDoc(collection(db, 'inventory', tgt, 'reagents'), {
                        name: srcItem.name, category: srcItem.category || "Otros", quantity: Math.abs(quantity), unit: srcItem.unit || unit || 'unidades',
                        minimumStock: srcItem.minimumStock || 1, expirationDate: srcItem.expirationDate || null, location: "", status: "ok", group: tgt,
                        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
                    })
                    await addDoc(collection(db, 'inventory_movements'), {
                        reagentId: newDoc.id, reagentName: srcItem.name, group: tgt, type: 'entry', quantity: Math.abs(quantity), unit: srcItem.unit || unit || 'unidades',
                        userId: user.uid, userName: `${userProfile?.firstName} ${userProfile?.lastName}`, notes: `Traslado desde ${src}`, createdAt: serverTimestamp()
                    })
                } else {
                    const tgtItem = tgtDoc.data()
                    await updateDoc(doc(db, 'inventory', tgt, 'reagents', tgtDoc.id), { quantity: (tgtItem.quantity || 0) + quantity, updatedAt: serverTimestamp() })
                    await addDoc(collection(db, 'inventory_movements'), {
                        reagentId: tgtDoc.id, reagentName: tgtItem.name, group: tgt, type: 'entry', quantity: Math.abs(quantity), unit: tgtItem.unit || unit || 'unidades',
                        userId: user.uid, userName: `${userProfile?.firstName} ${userProfile?.lastName}`, notes: `Traslado desde ${src}`, createdAt: serverTimestamp()
                    })
                }

                const msg = `✅ **Traslado completado.** Se han movido ${quantity} ${unit || ''} de **${srcItem.name}** desde **${src}** hacia **${tgt}**.`
                await addDoc(collection(db, 'chat_history', user.uid, 'messages'), { sender: 'bot', text: msg, createdAt: serverTimestamp() })
            }
        } catch (err) {
            console.error('Action execution failed:', err)
            await addDoc(collection(db, 'chat_history', user.uid, 'messages'), {
                sender: 'bot', text: `❌ Error al ejecutar la acción: ${err.message}`, createdAt: serverTimestamp()
            })
        } finally {
            if (shouldClearPending) setPendingConfirmation(null)
            setLoading(false)
        }
    }

    // Handle SEND
    const handleSend = async (testInput = '') => {
        const text = testInput || input
        if (!text.trim() || loading) return

        setInput('')

        // Handle Confirmation
        if (pendingConfirmation) {
            const isYes = text.toLowerCase().match(/^(sí|si|yes|claro|por supuesto|dale|ok|confirmar|confirmado)/i)
            const isNo = text.toLowerCase().match(/^(no|cancelar|detener|espera|cancel)/i)

            if (isYes) return await executeAction(pendingConfirmation)
            if (isNo) {
                setPendingConfirmation(null)
                return setMessages(prev => [...prev, { id: Date.now(), sender: 'bot', text: 'Entendido, cancelado. ¿Algo más?', time: new Date() }])
            }
            setPendingConfirmation(null)
        }

        // Add to Firestore (Memory Persistence)
        const userMsg = { sender: 'user', text, createdAt: serverTimestamp() }
        await addDoc(collection(db, 'chat_history', user.uid, 'messages'), userMsg)

        setLoading(true)

        try {
            const context = await gatherLabContext()

            const systemPrompt = `You are Glia, an intelligent laboratory assistant. 
ALWAYS respond in the following EXACT JSON format:
{
  "message": "Friendly response to show the user",
  "action": null | {
    "type": "registerInventoryMovement" | "moveInventory" | "createReservation",
    "params": {
      "group": "Target group name",
      "sourceGroup": "Source group name (if moving)",
      "targetGroup": "Target group name (if moving)",
      "reagentName": "Name of reagent",
      "movementType": "entry" | "exit",
      "quantity": number,
      "unit": "original unit",
      "notes": "any extra info"
    }
  },
  "needsConfirmation": true | false,
  "confirmationMessage": "Description of what will happen if confirmed"
}

INVENTORY RULES:
- 3 groups: Neurobioquímica, Bioquímica, Nutrición.
- To ADD or REMOVE reagents, use "registerInventoryMovement".
- To TRANSFER reagents between groups, use "moveInventory".
- ALWAYS set needsConfirmation to true for write actions. Make confirmationMessage natural and direct (e.g. "Voy a registrar la entrada de 5 mL de Etanol en Nutrición. ¿Confirmas?").
- DO NOT ask if the user wants to "create" a reagent. If an entry is confirmed and the reagent doesn't exist, I will automatically create it in the background.

Current user: ${userProfile?.firstName}, Role: ${userProfile?.role}, Group: ${userProfile?.group}
LAB CONTEXT:
${JSON.stringify(context, null, 2)}`

            const model = genAI.current?.getGenerativeModel({
                model: 'gemini-3-flash-preview',
                systemInstruction: systemPrompt
            })

            const contents = messages.slice(-20).map(m => ({
                role: m.sender === 'bot' ? 'model' : 'user',
                parts: [{ text: m.text }]
            }))
            contents.push({ role: 'user', parts: [{ text }] })

            const result = await model.generateContent({ contents })
            const rawText = result.response.text()

            // Extracción robusta de JSON (con o sin markdown)
            const jsonMatch = rawText.match(/\{[\s\S]*\}/)
            const cleanJson = jsonMatch ? jsonMatch[0] : rawText

            let gliaRes;
            try {
                gliaRes = JSON.parse(cleanJson)
            } catch (jsonErr) {
                console.error('Raw JSON Error:', cleanJson)
                throw new Error("El modelo generó un JSON inválido.")
            }

            // 1. Show message
            if (gliaRes.message) {
                await addDoc(collection(db, 'chat_history', user.uid, 'messages'), {
                    sender: 'bot', text: gliaRes.message, createdAt: serverTimestamp()
                })
            }

            // 2. Handle Action
            if (gliaRes.action) {
                if (gliaRes.needsConfirmation) {
                    setPendingConfirmation(gliaRes.action)
                    await addDoc(collection(db, 'chat_history', user.uid, 'messages'), {
                        sender: 'bot', text: gliaRes.confirmationMessage || '¿Confirmas esta acción?', createdAt: serverTimestamp()
                    })
                } else {
                    await executeAction(gliaRes.action)
                }
            }
        } catch (err) {
            console.error('Glia Technical Error (JSON Parse):', err)
            await addDoc(collection(db, 'chat_history', user.uid, 'messages'), {
                sender: 'bot', text: `Glia está teniendo problemas de procesamiento.Revisa el formato.`, createdAt: serverTimestamp()
            })
        }
        setLoading(false)
    }

    // Clear History
    const handleClearHistory = async () => {
        if (!user) return
        if (!window.confirm('¿Estás seguro de que deseas borrar todo el historial de chat con Glia? Esta acción no se puede deshacer.')) return

        setLoading(true)
        try {
            const q = query(collection(db, 'chat_history', user.uid, 'messages'))
            const snap = await getDocs(q)

            const batch = writeBatch(db)
            snap.docs.forEach(d => batch.delete(d.ref))
            await batch.commit()

            // Reset UI with greeting
            setMessages([{
                id: 'greeting',
                sender: 'bot',
                text: `Historial borrado. ¡Hola de nuevo ${firstName} ! 🧬\n¿En qué te puedo ayudar hoy ? `,
                time: new Date()
            }])
            toast.success('Historial borrado correctamente')
        } catch (err) {
            console.error('Error clearing history:', err)
            toast.error('No se pudo borrar el historial')
        }
        setLoading(false)
    }

    if (!isOpen) return null

    return (
        <div style={{
            position: 'fixed', bottom: '90px', right: '16px', zIndex: 999,
            display: 'flex', flexDirection: 'column',
            pointerEvents: 'none', width: '380px', maxWidth: 'calc(100vw - 32px)'
        }}>
            {/* Floating Window Container */}
            <div style={{
                background: '#F8FAFC', height: '65vh', width: '100%',
                borderRadius: '24px', position: 'relative',
                pointerEvents: 'auto', display: 'flex', flexDirection: 'column',
                animation: 'scaleInBottomRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: '0 8px 32px rgba(155, 114, 207, 0.25)',
                border: '1px solid rgba(155, 114, 207, 0.2)',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    background: 'linear-gradient(135deg, #9B72CF, #7B52AF)',
                    padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    boxShadow: '0 2px 10px rgba(155,114,207,0.2)', zIndex: 10
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', background: 'rgba(255,255,255,0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: '18px' }}>🧬</span>
                        </div>
                        <div>
                            <h2 style={{ fontSize: '18px', fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontWeight: '700', color: 'white', margin: 0, letterSpacing: '0.5px' }}>
                                Glia 🧬
                            </h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ADE80' }} />
                                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.9)', margin: 0, fontWeight: '600' }}>{firstName}</p>
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={handleClearHistory}
                            title="Borrar historial"
                            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.2s' }}
                        >
                            <Trash2 size={16} color="white" />
                        </button>
                        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.2s' }}>
                            <X size={18} color="white" />
                        </button>
                    </div>
                </div>

                {/* Messages Area */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {messages.map(m => (
                        <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.sender === 'user' ? 'flex-end' : 'flex-start', gap: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: m.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                                {m.sender === 'bot' && (
                                    <div style={{ width: '28px', height: '28px', background: 'linear-gradient(135deg, #9B72CF, #7B52AF)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '8px', flexShrink: 0, marginTop: '4px' }}>
                                        <Bot size={16} color="white" />
                                    </div>
                                )}
                                <div style={{
                                    background: m.sender === 'user' ? '#1A1A2E' : '#FFFFFF',
                                    color: m.sender === 'user' ? 'white' : '#1A1A2E',
                                    padding: '12px 16px', borderRadius: '16px', fontSize: '14.5px', fontWeight: '500', lineHeight: '1.5',
                                    borderBottomRightRadius: m.sender === 'user' ? '4px' : '16px',
                                    borderBottomLeftRadius: m.sender === 'bot' ? '4px' : '16px',
                                    boxShadow: m.sender === 'bot' ? '0 2px 12px rgba(0,0,0,0.06)' : '0 2px 12px rgba(26,26,46,0.15)',
                                    whiteSpace: 'pre-wrap'
                                }}>
                                    {/* Bold text rendering helper for bot responses */}
                                    {m.text.split(/(\*\*.*?\*\*)/).map((part, i) =>
                                        part.startsWith('**') && part.endsWith('**')
                                            ? <strong key={i} style={{ fontWeight: '800' }}>{part.slice(2, -2)}</strong>
                                            : part
                                    )}
                                </div>
                            </div>
                            <span style={{ fontSize: '10px', color: '#9CA3AF', padding: '0 36px', fontWeight: '600' }}>
                                {m.time?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    ))}

                    {/* Typing Indicator */}
                    {loading && (
                        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                            <div style={{ width: '28px', height: '28px', background: 'linear-gradient(135deg, #9B72CF, #7B52AF)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '8px', flexShrink: 0, marginTop: '4px' }}>
                                <Bot size={16} color="white" />
                            </div>
                            <div style={{
                                background: '#FFFFFF', padding: '16px', borderRadius: '16px',
                                borderBottomLeftRadius: '4px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                                display: 'flex', gap: '4px'
                            }}>
                                {[0, 1, 2].map(i => (
                                    <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#9B72CF', animation: `bounce 1s ease -in -out ${i * 0.2}s infinite` }} />
                                ))}
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area Sticky Bottom */}
                <div style={{ background: '#FFFFFF', borderTop: '1px solid #E5E7EB', padding: '12px 16px', paddingBottom: '20px' }}>
                    {/* Quick Actions Scrollable */}
                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', scrollbarWidth: 'none', margin: '0 -16px', paddingLeft: '16px', paddingRight: '16px' }}>
                        {QUICK_ACTIONS.map(action => (
                            <button
                                key={action}
                                onClick={() => handleSend(action)}
                                style={{
                                    background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: '16px',
                                    padding: '8px 14px', fontSize: '12px', fontWeight: '700', color: '#475569',
                                    cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s',
                                    display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                {action.includes('equipos') && <Beaker size={14} color="#9B72CF" />}
                                {action.includes('reserva') && <CalendarIcon size={14} color="#9B72CF" />}
                                {action.includes('reactivos') && <FlaskConical size={14} color="#9B72CF" />}
                                {action}
                            </button>
                        ))}
                    </div>

                    <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                            type="text"
                            placeholder="Pregúntale a Glia..."
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            // Input always enabled as requested
                            style={{
                                flex: 1, background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '24px',
                                padding: '12px 20px', fontSize: '15px', outline: 'none', color: '#1E293B',
                                transition: 'border-color 0.2s'
                            }}
                            onFocus={e => e.target.style.borderColor = '#9B72CF'}
                            onBlur={e => e.target.style.borderColor = '#E2E8F0'}
                        />
                        <button type="submit" disabled={!input.trim() || loading} style={{
                            width: '46px', height: '46px', borderRadius: '23px',
                            background: input.trim() ? '#9B72CF' : '#E2E8F0',
                            border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: input.trim() ? 'pointer' : 'not-allowed', color: 'white',
                            transition: 'all 0.2s', boxShadow: input.trim() ? '0 4px 12px rgba(155,114,207,0.3)' : 'none',
                            flexShrink: 0
                        }}>
                            <Send size={20} style={{ transform: 'translateX(-1px) translateY(1px)' }} />
                        </button>
                    </form>
                </div>

                <style>{`
            @keyframes bounce {
                0 %, 80 %, 100 % { transform: translateY(0); opacity: 0.5; }
                40 % { transform: translateY(-6px); opacity: 1; }
            }
            @keyframes scaleInBottomRight {
                0 % { transform: scale(0.9) translate(10%, 10 %); opacity: 0;
            }
            100 % { transform: scale(1) translate(0, 0); opacity: 1; }
        }
        `}</style>
            </div>
        </div>
    )
}
