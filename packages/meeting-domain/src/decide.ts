import type {
  AcceptedDecision,
  AttendanceRecord,
  BallotRecord,
  CandidateBallotRecord,
  CommandEnvelope,
  Decision,
  MeetingEvent,
  MeetingEventOf,
  MeetingEventPayloadMap,
  MeetingEventType,
  MeetingCommand,
  MeetingState,
  RulesProfile,
  RankedBallotRecord,
} from './types.js'
import { tallyBinaryVote, tallyPluralityVote, tallyRankedChoiceVote, tallyWeightedVote } from './vote-strategies.js'

export function decide(profile: RulesProfile, state: MeetingState, envelope: CommandEnvelope): Decision {
  const prior = state.processedCommands[envelope.id]
  if (prior !== undefined) return prior

  if (envelope.expectedVersion !== state.version) {
    return reject('STALE_VERSION', `Expected aggregate version ${envelope.expectedVersion}, received ${state.version}`)
  }

  if (profile.id !== state.rulesProfileId || profile.version !== state.rulesProfileVersion) {
    return reject('INVALID_COMMAND', 'Rules profile identity or version does not match meeting state')
  }

  if (isNewProceduralCommand(envelope.command.type) && parseIso(envelope.occurredAt) === undefined) {
    return reject('INVALID_COMMAND', 'Command time must be a valid timezone-qualified ISO timestamp')
  }

  switch (envelope.command.type) {
    case 'InitializeMeeting':
      if (!hasRole(envelope, ['administrator', 'chair'])) {
        return reject('ROLE_FORBIDDEN', 'Only an administrator or chair may initialize a meeting')
      }
      if (state.phase !== 'uninitialized') {
        return reject('INVALID_PHASE', 'A meeting may only be initialized once')
      }
      if (envelope.command.meetingId.trim() === '') {
        return reject('INVALID_COMMAND', 'Meeting ID must not be empty')
      }
      return accept([
        event(envelope, state.version + 1, 0, 'MeetingInitialized', {
          meetingId: envelope.command.meetingId,
          rulesProfileId: profile.id,
          rulesProfileVersion: profile.version,
        }),
      ])
    case 'OpenMeeting':
      return chairPhaseTransition(state, envelope, 'initialized', 'MeetingOpened')
    case 'RecessMeeting':
      return chairPhaseTransition(state, envelope, 'open', 'MeetingRecessed')
    case 'ResumeMeeting':
      return chairPhaseTransition(state, envelope, 'recessed', 'MeetingResumed')
    case 'AdjournMeeting':
      if (!hasRole(envelope, ['chair'])) return reject('ROLE_FORBIDDEN', 'Only the chair may adjourn the meeting')
      if (state.phase !== 'open' && state.phase !== 'recessed') {
        return reject('INVALID_PHASE', 'A meeting may only be adjourned while open or recessed')
      }
      return accept([event(envelope, state.version + 1, 0, 'MeetingAdjourned', {})])
    case 'CheckInParticipant': {
      const invalid = validateAttendanceCommand(state, envelope)
      if (invalid !== undefined) return invalid
      if (state.attendance[envelope.command.participantId]?.checkedIn === true) {
        return reject('INVALID_COMMAND', 'Participant is already checked in')
      }
      if (envelope.command.participantRole === 'alternate' && envelope.command.alternateFor === undefined) {
        return reject('INVALID_COMMAND', 'An alternate must identify the delegate they may replace')
      }
      const record: AttendanceRecord = {
        participantId: envelope.command.participantId,
        role: envelope.command.participantRole,
        checkedIn: true,
        active: envelope.command.participantRole === 'delegate',
        ...(envelope.command.alternateFor === undefined ? {} : { alternateFor: envelope.command.alternateFor }),
      }
      const deactivatedAlternates = envelope.command.participantRole === 'delegate'
        ? activeAlternatesFor(state, envelope.command.participantId)
        : []
      return attendanceDecision(state, envelope, 'ParticipantCheckedIn', {
        record,
        deactivatedAlternateIds: deactivatedAlternates.map((alternate) => alternate.participantId),
      }, {
        ...state.attendance,
        ...Object.fromEntries(deactivatedAlternates.map((alternate) => [
          alternate.participantId,
          { ...alternate, active: false },
        ])),
        [record.participantId]: record,
      })
    }
    case 'CheckOutParticipant': {
      const invalid = validateAttendanceCommand(state, envelope)
      if (invalid !== undefined) return invalid
      const current = state.attendance[envelope.command.participantId]
      if (current?.checkedIn !== true) return reject('INVALID_COMMAND', 'Participant is not checked in')
      const record = { ...current, checkedIn: false, active: false }
      return attendanceDecision(state, envelope, 'ParticipantCheckedOut', { participantId: record.participantId }, {
        ...state.attendance,
        [record.participantId]: record,
      })
    }
    case 'ActivateAlternate': {
      const invalid = validateAttendanceCommand(state, envelope)
      if (invalid !== undefined) return invalid
      const alternate = state.attendance[envelope.command.alternateId]
      const delegate = state.attendance[envelope.command.delegateId]
      if (alternate?.checkedIn !== true || alternate.role !== 'alternate' || alternate.alternateFor !== envelope.command.delegateId) {
        return reject('INVALID_COMMAND', 'Alternate is not checked in for the named delegate')
      }
      if (delegate?.checkedIn === true && delegate.active) {
        return reject('INVALID_COMMAND', 'Cannot activate an alternate while the delegate is active')
      }
      const attendance = {
        ...state.attendance,
        ...Object.fromEntries(activeAlternatesFor(state, envelope.command.delegateId)
          .filter((record) => record.participantId !== alternate.participantId)
          .map((record) => [record.participantId, { ...record, active: false }])),
        [alternate.participantId]: { ...alternate, active: true },
        ...(delegate === undefined ? {} : { [delegate.participantId]: { ...delegate, active: false } }),
      }
      const deactivatedAlternateIds = activeAlternatesFor(state, envelope.command.delegateId)
        .filter((record) => record.participantId !== alternate.participantId)
        .map((record) => record.participantId)
      return attendanceDecision(state, envelope, 'AlternateActivated', {
        alternateId: alternate.participantId,
        delegateId: envelope.command.delegateId,
        deactivatedAlternateIds,
      }, attendance)
    }
    case 'AdoptAgenda': {
      const invalid = validateFloorOperation(state, envelope, ['chair'])
      if (invalid) return invalid
      const items = envelope.command.items.map((item, index) => ({
        id: item.id.trim(),
        title: item.title.trim(),
        status: index === 0 ? 'current' as const : 'pending' as const,
      }))
      const ids = items.map((item) => item.id)
      if (ids.length === 0 || ids.some((id) => id === '') || items.some((item) => item.title === '')
        || new Set(ids).size !== ids.length) {
        return reject('INVALID_COMMAND', 'Agenda item IDs and titles must be non-empty, and IDs must be unique')
      }
      if (state.agenda.length > 0) return reject('INVALID_COMMAND', 'The agenda has already been adopted')
      return accept([event(envelope, state.version + 1, 0, 'AgendaAdopted', { items })])
    }
    case 'AdvanceAgenda': {
      const invalid = validateFloorOperation(state, envelope, ['chair'])
      if (invalid) return invalid
      const currentIndex = state.agenda.findIndex((item) => item.status === 'current')
      if (currentIndex < 0) return reject('INVALID_COMMAND', 'There is no current agenda item')
      const currentItemId = state.agenda[currentIndex + 1]?.id
      return accept([event(envelope, state.version + 1, 0, 'AgendaAdvanced', { completedItemId: state.agenda[currentIndex]!.id, ...(currentItemId ? { currentItemId } : {}) })])
    }
    case 'JoinRecognitionQueue': {
      const invalid = validateParticipantFloorOperation(state, envelope)
      if (invalid) return invalid
      if (state.recognitionQueues[envelope.command.side].includes(envelope.actorId)) {
        return reject('ALREADY_QUEUED', 'Participant is already in that recognition queue')
      }
      return accept([event(envelope, state.version + 1, 0, 'RecognitionQueueJoined', { side: envelope.command.side, participantId: envelope.actorId })])
    }
    case 'WithdrawRecognitionQueue': {
      const invalid = validateParticipantFloorOperation(state, envelope)
      if (invalid) return invalid
      if (!state.recognitionQueues[envelope.command.side].includes(envelope.actorId)) {
        return reject('INVALID_COMMAND', 'Participant is not in that recognition queue')
      }
      return accept([event(envelope, state.version + 1, 0, 'RecognitionQueueWithdrawn', { side: envelope.command.side, participantId: envelope.actorId })])
    }
    case 'ReorderRecognitionQueue': {
      const invalid = validateFloorOperation(state, envelope, ['chair'])
      if (invalid) return invalid
      if (!activeMotion(state)) return reject('NO_ACTIVE_QUESTION', 'Recognition requires an active floor question')
      const current = state.recognitionQueues[envelope.command.side]
      const proposed = envelope.command.participantIds
      const proposedSet = new Set(proposed)
      const hasExactMembership = proposedSet.size === proposed.length
        && proposed.length === current.length
        && current.every((participantId) => proposedSet.has(participantId))
      if (!hasExactMembership) {
        return reject('INVALID_COMMAND', 'Reordered queue must contain exactly the existing participants')
      }
      return accept([event(envelope, state.version + 1, 0, 'RecognitionQueueReordered', { side: envelope.command.side, participantIds: proposed })])
    }
    case 'IntroduceMotion': {
      const invalid = validateParticipantFloorOperation(state, envelope, false)
      if (invalid) return invalid
      if (state.motionStack.length > 0) {
        return reject('ACTIVE_QUESTION_EXISTS', 'Only one authoritative floor question is allowed')
      }
      const motionId = envelope.command.motionId.trim()
      const text = envelope.command.text.trim()
      if (!validNewMotion(state, motionId, text)) return reject('INVALID_COMMAND', 'Motion ID must be unique and motion text must not be empty')
      return accept([event(envelope, state.version + 1, 0, 'MotionIntroduced', { motion: { id: motionId, text, moverId: envelope.actorId, status: 'pendingSecond' } })])
    }
    case 'SecondMotion': {
      const invalid = validateParticipantFloorOperation(state, envelope)
      if (invalid) return invalid
      const motion = state.motions[envelope.command.motionId.trim()]
      if (!motion || motion.id !== state.motionStack.at(-1) || motion.status !== 'pendingSecond') {
        return reject('NO_ACTIVE_QUESTION', 'Named motion is not awaiting a second')
      }
      if (motion.moverId === envelope.actorId) return reject('INVALID_COMMAND', 'A motion requires a different seconder')
      return accept([event(envelope, state.version + 1, 0, 'MotionSeconded', { motionId: motion.id, seconderId: envelope.actorId })])
    }
    case 'AmendMotion': {
      const invalid = validateParticipantFloorOperation(state, envelope)
      if (invalid) return invalid
      const parent = state.motions[envelope.command.parentId.trim()]
      if (!parent || parent.id !== state.motionStack.at(-1) || parent.status !== 'active') {
        return reject('INVALID_PARENT', 'Parent must be the current active motion')
      }
      if (hasUnresolvedProcedure(state, parent.id)) {
        return reject('INVALID_COMMAND', 'Current motion has unresolved parliamentary procedure')
      }
      if (hasAnyVote(state, parent.id)) return reject('INVALID_COMMAND', 'Current motion has already been voted on')
      const motionId = envelope.command.motionId.trim()
      const text = envelope.command.text.trim()
      if (!validNewMotion(state, motionId, text)) return reject('INVALID_COMMAND', 'Motion ID must be unique and motion text must not be empty')
      return accept([event(envelope, state.version + 1, 0, 'MotionAmended', { motion: { id: motionId, text, moverId: envelope.actorId, parentId: parent.id, status: 'pendingSecond' } })])
    }
    case 'WithdrawMotion': {
      const invalid = validateFloorOperation(state, envelope, ['chair', 'delegate', 'alternate'])
      if (invalid) return invalid
      const motion = currentMotion(state, envelope.command.motionId.trim())
      if (!motion) return reject('NO_ACTIVE_QUESTION', 'Named motion is not current')
      if (hasUnresolvedProcedure(state, motion.id)) {
        return reject('INVALID_COMMAND', 'Current motion has unresolved parliamentary procedure')
      }
      if (hasUnresolvedVote(state, motion.id)) return reject('INVALID_COMMAND', 'Current motion has an unresolved vote')
      if (envelope.role !== 'chair' && (motion.status !== 'pendingSecond' || motion.moverId !== envelope.actorId)) {
        return reject('ROLE_FORBIDDEN', 'Only the mover may withdraw a pending-second motion')
      }
      const reason = envelope.command.reason?.trim()
      if (envelope.role === 'chair' && !reason) return reject('INVALID_COMMAND', 'Chair withdrawal requires a non-empty reason')
      return accept([event(envelope, state.version + 1, 0, 'MotionWithdrawn', { motionId: motion.id, ...(reason ? { reason } : {}) })])
    }
    case 'TableMotion':
    case 'DisposeMotion': {
      const invalid = validateFloorOperation(state, envelope, ['chair'])
      if (invalid) return invalid
      const motion = currentMotion(state, envelope.command.motionId.trim())
      if (!motion) return reject('NO_ACTIVE_QUESTION', 'Named motion is not current')
      if (hasUnresolvedProcedure(state, motion.id)) {
        return reject('INVALID_COMMAND', 'Current motion has unresolved parliamentary procedure')
      }
      if (hasUnresolvedVote(state, motion.id)) return reject('INVALID_COMMAND', 'Current motion has an unresolved vote')
      const value = (envelope.command.type === 'TableMotion' ? envelope.command.reason : envelope.command.disposition).trim()
      if (value === '') return reject('INVALID_COMMAND', 'A reason or disposition is required')
      return envelope.command.type === 'TableMotion'
        ? accept([event(envelope, state.version + 1, 0, 'MotionTabled', { motionId: motion.id, reason: value })])
        : accept([event(envelope, state.version + 1, 0, 'MotionDisposed', { motionId: motion.id, disposition: value })])
    }
    case 'OpenDebate': {
      const invalid = validateFloorOperation(state, envelope, ['chair'])
      if (invalid) return invalid
      const motion = currentMotion(state, envelope.command.motionId.trim())
      if (!motion || motion.status !== 'active') return reject('NO_ACTIVE_QUESTION', 'Debate requires the current active motion')
      if (hasAnyVote(state, motion.id)) return reject('INVALID_COMMAND', 'Current motion has already been voted on')
      if (state.debate !== null) return reject('INVALID_COMMAND', 'Debate has already occurred for the current question')
      const openedAt = parseIso(envelope.occurredAt)
      const closesAt = parseIso(envelope.command.closesAt)
      if (openedAt === undefined || closesAt === undefined || closesAt <= openedAt) {
        return reject('INVALID_COMMAND', 'Debate deadline must be a valid ISO timestamp after the command time')
      }
      return accept([event(envelope, state.version + 1, 0, 'DebateOpened', {
        debate: { motionId: motion.id, openedAt: envelope.occurredAt, closesAt: envelope.command.closesAt, status: 'open' },
      })])
    }
    case 'CloseDebate': {
      const invalid = validateFloorOperation(state, envelope, ['chair'])
      if (invalid) return invalid
      const debate = state.debate
      if (!debate || debate.status !== 'open' || debate.motionId !== envelope.command.motionId.trim()) {
        return reject('INVALID_COMMAND', 'Named motion has no open debate')
      }
      const closedAt = parseIso(envelope.occurredAt)
      if (closedAt === undefined) return reject('INVALID_COMMAND', 'Close time must be a valid ISO timestamp')
      if (closedAt < Date.parse(debate.openedAt)) {
        return reject('INVALID_COMMAND', 'Debate cannot close before it opened')
      }
      const reason = envelope.command.reason?.trim()
      if (closedAt < Date.parse(debate.closesAt) && !reason) {
        return reject('INVALID_COMMAND', 'Closing debate before its deadline requires a reason')
      }
      return accept([event(envelope, state.version + 1, 0, 'DebateClosed', {
        motionId: debate.motionId, closedAt: envelope.occurredAt, ...(reason ? { reason } : {}),
      })])
    }
    case 'RaisePointOfOrder': {
      const invalid = validateParticipantFloorOperation(state, envelope)
      if (invalid) return invalid
      if (Object.values(state.pointsOfOrder).some((point) => point.status === 'pending')) {
        return reject('INVALID_COMMAND', 'Only one point of order may be pending')
      }
      const pointId = envelope.command.pointId.trim()
      const text = envelope.command.text.trim()
      if (!pointId || !text || state.pointsOfOrder[pointId]) return reject('INVALID_COMMAND', 'Point ID must be unique and text non-empty')
      const motion = activeMotion(state)!
      return accept([event(envelope, state.version + 1, 0, 'PointOfOrderRaised', {
        point: { id: pointId, text, raiserId: envelope.actorId, motionId: motion.id, raisedAt: envelope.occurredAt, status: 'pending' },
      })])
    }
    case 'RuleOnPointOfOrder': {
      const invalid = validateFloorOperation(state, envelope, ['chair'])
      if (invalid) return invalid
      const point = state.pointsOfOrder[envelope.command.pointId.trim()]
      const reason = envelope.command.reason.trim()
      if (!point || point.status !== 'pending') return reject('INVALID_COMMAND', 'Named point is not pending')
      if (point.motionId !== activeMotion(state)?.id) return reject('INVALID_COMMAND', 'Point does not belong to the current question')
      if (!reason) return reject('INVALID_COMMAND', 'A ruling reason is required')
      return accept([event(envelope, state.version + 1, 0, 'PointOfOrderRuled', { pointId: point.id, ruling: envelope.command.ruling, reason, ruledAt: envelope.occurredAt, rulerId: envelope.actorId })])
    }
    case 'AppealRuling': {
      const invalid = validateParticipantFloorOperation(state, envelope)
      if (invalid) return invalid
      const point = state.pointsOfOrder[envelope.command.pointId.trim()]
      const appealId = envelope.command.appealId.trim()
      if (!point || point.status !== 'ruled') return reject('INVALID_COMMAND', 'Named point has no appealable ruling')
      if (point.motionId !== activeMotion(state)?.id) return reject('INVALID_COMMAND', 'Ruling does not belong to the current question')
      if (point.appeal) return reject('INVALID_COMMAND', 'The ruling already has an appeal')
      if (!appealId || Object.values(state.pointsOfOrder).some((entry) => entry.appeal?.id === appealId)) return reject('INVALID_COMMAND', 'Appeal ID must be unique and non-empty')
      const grounds = envelope.command.grounds?.trim()
      return accept([event(envelope, state.version + 1, 0, 'RulingAppealed', { pointId: point.id, appeal: { id: appealId, appellantId: envelope.actorId, appealedAt: envelope.occurredAt, status: 'pending', ...(grounds ? { grounds } : {}) } })])
    }
    case 'RecordAppealOutcome': {
      const invalid = validateFloorOperation(state, envelope, ['chair', 'secretary'])
      if (invalid) return invalid
      const point = state.pointsOfOrder[envelope.command.pointId.trim()]
      const appeal = point?.appeal
      const reason = envelope.command.reason.trim()
      if (!appeal || appeal.id !== envelope.command.appealId.trim() || appeal.status !== 'pending') return reject('INVALID_COMMAND', 'Named appeal is not pending')
      if (point.motionId !== activeMotion(state)?.id) return reject('INVALID_COMMAND', 'Appeal does not belong to the current question')
      if (!reason) return reject('INVALID_COMMAND', 'An appeal outcome reason is required')
      return accept([event(envelope, state.version + 1, 0, 'AppealOutcomeRecorded', { pointId: point.id, appealId: appeal.id, outcome: envelope.command.outcome, reason, decidedAt: envelope.occurredAt, deciderId: envelope.actorId })])
    }
    case 'OpenVote': {
      const invalid = validateFloorOperation(state, envelope, ['chair'])
      if (invalid) return invalid
      const motion = currentMotion(state, envelope.command.motionId.trim())
      if (!motion || motion.status !== 'active') return reject('NO_ACTIVE_QUESTION', 'Voting requires the current active motion')
      if (state.debate?.status === 'open') return reject('INVALID_COMMAND', 'Debate must be closed before voting')
      if (hasUnresolvedProcedure(state, motion.id) || hasAnyVote(state, motion.id)) return reject('INVALID_COMMAND', 'Current motion has unresolved procedure or a prior vote')
      const voteId = envelope.command.voteId.trim()
      if (!voteId || state.votes[voteId]) return reject('INVALID_COMMAND', 'Vote ID must be unique and non-empty')
      const method = envelope.command.method
      if ((method !== 'counted' && method !== 'rollCall' && method !== 'weighted' && method !== 'plurality' && method !== 'rankedChoice') || !profile.voteMethods.includes(method)) return reject('INVALID_COMMAND', 'Vote method must be permitted by the rules profile')
      if (!validThreshold(profile.motionThreshold)) return reject('INVALID_COMMAND', 'Motion threshold must contain valid positive integers')
      const weights = method === 'weighted' ? validWeightSnapshot(state, envelope.command.weights) : undefined
      if (method === 'weighted' && !weights) return reject('INVALID_COMMAND', 'Weighted voting requires one positive integer weight for every active representative')
      const optionIds = method === 'plurality' || method === 'rankedChoice' ? validOptionIds(envelope.command.optionIds) : undefined
      if ((method === 'plurality' || method === 'rankedChoice') && !optionIds) return reject('INVALID_COMMAND', 'Candidate voting requires at least two unique non-empty options')
      return accept([event(envelope, state.version + 1, 0, 'VoteOpened', { vote: { id: voteId, motionId: motion.id, method, visibility: 'nonSecretSimulator', rule: { rulesProfileId: profile.id, rulesProfileVersion: profile.version, threshold: { ...profile.motionThreshold }, tiePolicy: profile.tiePolicy }, ...(weights ? { weights } : {}), ...(optionIds ? { optionIds } : {}), status: 'open', openedAt: envelope.occurredAt, ballots: {} } })])
    }
    case 'CastVote': {
      const invalid = validateParticipantFloorOperation(state, envelope)
      if (invalid) return invalid
      const vote = state.votes[envelope.command.voteId.trim()]
      if (!vote || vote.status !== 'open' || vote.motionId !== activeMotion(state)?.id) return reject('INVALID_COMMAND', 'Named vote is not open for the current question')
      if (Object.values(state.votes).some((candidate) => candidate.motionId === vote.motionId
        && candidate.ballots[envelope.actorId] !== undefined)) {
        return reject('ALREADY_VOTED', 'Representative has already voted')
      }
      if (parseIso(envelope.occurredAt)! < parseIso(vote.openedAt)!) return reject('INVALID_COMMAND', 'Ballot cannot precede vote opening')
      if (vote.method === 'plurality') {
        if (!('optionId' in envelope.command) || !vote.optionIds?.includes(envelope.command.optionId)) return reject('INVALID_COMMAND', 'Plurality ballot must name a configured option')
        return accept([event(envelope, state.version + 1, 0, 'VoteCast', { voteId: vote.id, voterId: envelope.actorId, ballot: { optionId: envelope.command.optionId, castAt: envelope.occurredAt } })])
      }
      if (vote.method === 'rankedChoice') {
        const ranking = 'ranking' in envelope.command ? validRanking(envelope.command.ranking, vote.optionIds!) : undefined
        if (!ranking) return reject('INVALID_COMMAND', 'Ranked-choice ballot must rank unique configured options')
        return accept([event(envelope, state.version + 1, 0, 'VoteCast', { voteId: vote.id, voterId: envelope.actorId, ballot: { ranking, castAt: envelope.occurredAt } })])
      }
      if (!('choice' in envelope.command)) return reject('INVALID_COMMAND', 'Binary ballot must contain yes, no, or abstain')
      return accept([event(envelope, state.version + 1, 0, 'VoteCast', { voteId: vote.id, voterId: envelope.actorId, ballot: { choice: envelope.command.choice, castAt: envelope.occurredAt } })])
    }
    case 'CloseVote': {
      const invalid = validateFloorOperation(state, envelope, ['chair'])
      if (invalid) return invalid
      const vote = state.votes[envelope.command.voteId.trim()]
      if (!vote || vote.status !== 'open' || vote.motionId !== activeMotion(state)?.id) return reject('INVALID_COMMAND', 'Named vote is not open for the current question')
      const closedAt = parseIso(envelope.occurredAt)!
      if (closedAt < parseIso(vote.openedAt)! || Object.values(vote.ballots).some((ballot) => closedAt < parseIso(ballot.castAt)!)) {
        return reject('INVALID_COMMAND', 'Vote cannot close before opening or a recorded ballot')
      }
      return accept([event(envelope, state.version + 1, 0, 'VoteClosed', { voteId: vote.id, closedAt: envelope.occurredAt })])
    }
    case 'RecordVoteOutcome': {
      const invalid = validateFloorOperation(state, envelope, ['chair', 'teller', 'secretary'])
      if (invalid) return invalid
      const vote = state.votes[envelope.command.voteId.trim()]
      if (!vote || vote.status !== 'closed' || vote.motionId !== activeMotion(state)?.id) return reject('INVALID_COMMAND', 'Named vote is not closed for the current question')
      if (parseIso(envelope.occurredAt)! < parseIso(vote.closedAt!)!) return reject('INVALID_COMMAND', 'Outcome cannot precede vote closing')
      const tally = vote.method === 'plurality'
        ? tallyPluralityVote(vote.ballots as Readonly<Record<string, CandidateBallotRecord>>, vote.optionIds!)
        : vote.method === 'rankedChoice'
          ? tallyRankedChoiceVote(vote.ballots as Readonly<Record<string, RankedBallotRecord>>, vote.optionIds!)
          : vote.method === 'weighted'
          ? tallyWeightedVote(vote.ballots as Readonly<Record<string, BallotRecord>>, vote.weights!, vote.rule)
          : tallyBinaryVote(vote.ballots as Readonly<Record<string, BallotRecord>>, vote.rule)
      return accept([event(envelope, state.version + 1, 0, 'VoteOutcomeRecorded', { outcome: { voteId: vote.id, motionId: vote.motionId, method: vote.method, visibility: vote.visibility, rule: { ...vote.rule, threshold: { ...vote.rule.threshold } }, ...(vote.weights ? { weights: { ...vote.weights } } : {}), ...(vote.optionIds ? { optionIds: [...vote.optionIds] } : {}), ...tally, recordedAt: envelope.occurredAt, recorderId: envelope.actorId } })])
    }
    case 'ApplyChairCorrection': {
      if (!hasRole(envelope, ['chair', 'parliamentarian'])) return reject('ROLE_FORBIDDEN', 'Only chair or parliamentarian may apply corrections')
      if (state.phase === 'uninitialized') return reject('INVALID_PHASE', 'Meeting must be initialized before correction')
      const correctionId = envelope.command.correctionId.trim()
      const affectedEventId = envelope.command.affectedEventId.trim()
      const reason = envelope.command.reason.trim()
      if (!correctionId || state.corrections.some((record) => record.correctionId === correctionId)) return reject('INVALID_COMMAND', 'Correction ID must be unique and non-empty')
      if (!reason) return reject('INVALID_COMMAND', 'Correction reason must be non-empty')
      const patch = normalizeCorrectionPatch(envelope.command.patch)
      if (!patch) return reject('INVALID_COMMAND', 'Correction target and value must be valid')
      const affectedEvent = findProcessedEvent(state, affectedEventId)
      if (!affectedEvent || !eventSupportsCorrection(affectedEvent, patch)) {
        return reject('INVALID_COMMAND', 'Affected event must directly support the correction target')
      }
      if (patch.type === 'agendaTitle' && !state.agenda.some((item) => item.id === patch.itemId)) return reject('INVALID_COMMAND', 'Agenda target does not exist')
      if (patch.type === 'motionText' && !state.motions[patch.motionId]) return reject('INVALID_COMMAND', 'Motion target does not exist')
      if (patch.type === 'motionDisposition' && state.motions[patch.motionId]?.status !== 'disposed') return reject('INVALID_COMMAND', 'Disposition correction requires a disposed motion')
      const actorRole = envelope.role as 'chair' | 'parliamentarian'
      return accept([event(envelope, state.version + 1, 0, 'ChairCorrectionApplied', { correctionId, affectedEventId, reason, actorId: envelope.actorId, actorRole, correctedAt: envelope.occurredAt, patch })])
    }
    default:
      return reject('INVALID_COMMAND', 'Command is not implemented')
  }
}

function validateFloorOperation(state: MeetingState, envelope: CommandEnvelope, roles: readonly CommandEnvelope['role'][]): Decision | undefined {
  if (!hasRole(envelope, roles)) return reject('ROLE_FORBIDDEN', 'Actor role is not permitted for this floor operation')
  if (state.phase !== 'open') return reject('INVALID_PHASE', 'Meeting must be open')
  if (!state.quorum.met) return reject('QUORUM_REQUIRED', 'Quorum is required')
  return undefined
}

function validateParticipantFloorOperation(state: MeetingState, envelope: CommandEnvelope, requireQuestion = true): Decision | undefined {
  const invalid = validateFloorOperation(state, envelope, ['delegate', 'alternate'])
  if (invalid) return invalid
  const record = state.attendance[envelope.actorId]
  if (!record?.checkedIn || !record.active || record.role !== envelope.role) {
    return reject('ROLE_FORBIDDEN', 'Actor must occupy an active checked-in representative seat')
  }
  if (requireQuestion && !activeMotion(state)) return reject('NO_ACTIVE_QUESTION', 'An active floor question is required')
  return undefined
}

function activeMotion(state: MeetingState) {
  const id = state.motionStack.at(-1)
  return id ? state.motions[id] : undefined
}

function currentMotion(state: MeetingState, id: string) {
  const motion = activeMotion(state)
  return motion?.id === id ? motion : undefined
}

function validNewMotion(state: MeetingState, id: string, text: string) {
  return id !== '' && text !== '' && state.motions[id] === undefined
}

function parseIso(value: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!match) return undefined
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const monthLengths = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  const daysInMonth = monthLengths[month - 1] ?? 0
  if (day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) return undefined
  if (zone !== 'Z') {
    const offsetHour = Number(zone.slice(1, 3))
    const offsetMinute = Number(zone.slice(4, 6))
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return undefined
  }
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : undefined
}

function isNewProceduralCommand(type: MeetingCommand['type']): boolean {
  return ['OpenDebate', 'CloseDebate', 'RaisePointOfOrder', 'RuleOnPointOfOrder', 'AppealRuling', 'RecordAppealOutcome', 'OpenVote', 'CastVote', 'CloseVote', 'RecordVoteOutcome', 'ApplyChairCorrection'].includes(type)
}

function findProcessedEvent(state: MeetingState, eventId: string): MeetingEvent | undefined {
  for (const decision of Object.values(state.processedCommands)) {
    const found = decision.events.find((meetingEvent) => meetingEvent.id === eventId)
    if (found) return found
  }
  return undefined
}

function eventSupportsCorrection(
  affectedEvent: MeetingEvent,
  patch: NonNullable<ReturnType<typeof normalizeCorrectionPatch>>,
): boolean {
  if (affectedEvent.type === 'ChairCorrectionApplied') {
    const priorPatch = affectedEvent.payload.patch
    if (patch.type === 'motionText') {
      return priorPatch.type === 'motionText' && priorPatch.motionId === patch.motionId
    }
    if (patch.type === 'agendaTitle') {
      return priorPatch.type === 'agendaTitle' && priorPatch.itemId === patch.itemId
    }
    return priorPatch.type === 'motionDisposition' && priorPatch.motionId === patch.motionId
  }
  if (patch.type === 'motionText') {
    return (affectedEvent.type === 'MotionIntroduced' || affectedEvent.type === 'MotionAmended')
      && affectedEvent.payload.motion.id === patch.motionId
  }
  if (patch.type === 'agendaTitle') {
    return affectedEvent.type === 'AgendaAdopted'
      && affectedEvent.payload.items.some((item) => item.id === patch.itemId)
  }
  return affectedEvent.type === 'MotionDisposed'
    && affectedEvent.payload.motionId === patch.motionId
}

function normalizeCorrectionPatch(patch: Extract<MeetingCommand, { type: 'ApplyChairCorrection' }>['patch']) {
  switch (patch.type) {
    case 'motionText': {
      const motionId = patch.motionId.trim()
      const correctedText = patch.correctedText.trim()
      return motionId && correctedText ? { type: 'motionText' as const, motionId, correctedText } : undefined
    }
    case 'agendaTitle': {
      const itemId = patch.itemId.trim()
      const correctedTitle = patch.correctedTitle.trim()
      return itemId && correctedTitle ? { type: 'agendaTitle' as const, itemId, correctedTitle } : undefined
    }
    case 'motionDisposition': {
      const motionId = patch.motionId.trim()
      const correctedDisposition = patch.correctedDisposition.trim()
      return motionId && correctedDisposition ? { type: 'motionDisposition' as const, motionId, correctedDisposition } : undefined
    }
  }
}

function hasUnresolvedVote(state: MeetingState, motionId: string): boolean {
  return Object.values(state.votes).some((vote) => vote.motionId === motionId && vote.status !== 'recorded')
}

function hasAnyVote(state: MeetingState, motionId: string): boolean {
  return Object.values(state.votes).some((vote) => vote.motionId === motionId)
}

function validThreshold(threshold: RulesProfile['motionThreshold']): boolean {
  return Number.isInteger(threshold.numerator) && Number.isInteger(threshold.denominator)
    && threshold.numerator > 0 && threshold.denominator > 0 && threshold.numerator <= threshold.denominator
}

function hasUnresolvedProcedure(state: MeetingState, motionId: string): boolean {
  return Object.values(state.pointsOfOrder).some((point) => point.motionId === motionId
    && (point.status === 'pending' || point.appeal?.status === 'pending'))
}

function validateAttendanceCommand(state: MeetingState, envelope: CommandEnvelope): Decision | undefined {
  if (!hasRole(envelope, ['chair', 'secretary', 'technicalOperator'])) {
    return reject('ROLE_FORBIDDEN', 'Only the chair, secretary, or technical operator may manage attendance')
  }
  if (state.phase === 'uninitialized' || state.phase === 'adjourned') {
    return reject('INVALID_PHASE', 'Attendance may only change during an initialized meeting')
  }
  return undefined
}

function attendanceDecision<T extends 'ParticipantCheckedIn' | 'ParticipantCheckedOut' | 'AlternateActivated'>(
  state: MeetingState,
  envelope: CommandEnvelope,
  type: T,
  payload: MeetingEventPayloadMap[T],
  attendance: MeetingState['attendance'],
): Decision {
  const events: MeetingEvent[] = [event(envelope, state.version + 1, 0, type, payload)]
  const present = countPresent(attendance)
  const met = present >= state.quorum.required
  if (met !== state.quorum.met) {
    events.push(event(envelope, state.version + 2, 1, 'QuorumChanged', {
      present,
      required: state.quorum.required,
      met,
    }))
  }
  return accept(events)
}

function activeAlternatesFor(state: MeetingState, delegateId: string): AttendanceRecord[] {
  return Object.values(state.attendance).filter((record) =>
    record.role === 'alternate' && record.alternateFor === delegateId && record.active)
}

function validWeightSnapshot(
  state: MeetingState,
  candidate: Readonly<Record<string, number>>,
): Record<string, number> | undefined {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return undefined
  const eligibleIds = Object.values(state.attendance)
    .filter((record) => record.checkedIn && record.active && (record.role === 'delegate' || record.role === 'alternate'))
    .map((record) => record.participantId)
    .sort()
  const suppliedIds = Object.keys(candidate).sort()
  if (eligibleIds.length !== suppliedIds.length || eligibleIds.some((id, index) => id !== suppliedIds[index])) return undefined
  if (suppliedIds.some((id) => !Number.isSafeInteger(candidate[id]) || candidate[id]! <= 0)) return undefined
  return Object.fromEntries(suppliedIds.map((id) => [id, candidate[id]!]))
}

function validOptionIds(candidate: readonly string[]): string[] | undefined {
  if (!Array.isArray(candidate) || candidate.length < 2) return undefined
  const optionIds = candidate.map((optionId) => typeof optionId === 'string' ? optionId.trim() : '')
  if (optionIds.some((optionId) => !optionId) || new Set(optionIds).size !== optionIds.length) return undefined
  return optionIds
}

function validRanking(candidate: readonly string[], optionIds: readonly string[]): string[] | undefined {
  if (!Array.isArray(candidate) || candidate.length === 0 || candidate.length > optionIds.length) return undefined
  const ranking = candidate.map((optionId) => typeof optionId === 'string' ? optionId.trim() : '')
  if (ranking.some((optionId) => !optionId || !optionIds.includes(optionId)) || new Set(ranking).size !== ranking.length) return undefined
  return ranking
}

function countPresent(attendance: MeetingState['attendance']): number {
  return Object.values(attendance).filter((record) =>
    record.checkedIn && record.active && (record.role === 'delegate' || record.role === 'alternate')).length
}

function chairPhaseTransition(
  state: MeetingState,
  envelope: CommandEnvelope,
  requiredPhase: MeetingState['phase'],
  type: 'MeetingOpened' | 'MeetingRecessed' | 'MeetingResumed',
): Decision {
  if (!hasRole(envelope, ['chair'])) return reject('ROLE_FORBIDDEN', 'Only the chair may change the meeting phase')
  if (state.phase !== requiredPhase) return reject('INVALID_PHASE', `Meeting must be ${requiredPhase}`)
  return accept([event(envelope, state.version + 1, 0, type, {})])
}

function hasRole(envelope: CommandEnvelope, roles: readonly CommandEnvelope['role'][]): boolean {
  return roles.includes(envelope.role)
}

export function event<T extends MeetingEventType>(
  envelope: CommandEnvelope,
  aggregateVersion: number,
  eventIndex: number,
  type: T,
  payload: MeetingEventPayloadMap[T],
): MeetingEventOf<T> {
  return {
    id: `${envelope.id}:${eventIndex}`,
    type,
    aggregateVersion,
    occurredAt: envelope.occurredAt,
    causationId: envelope.id,
    payload: { ...payload },
  } as MeetingEventOf<T>
}

function accept(events: readonly MeetingEvent[]): AcceptedDecision {
  return { accepted: true, events }
}

function reject(code: Exclude<Decision, AcceptedDecision>['code'], explanation: string): Decision {
  return { accepted: false, code, explanation }
}
