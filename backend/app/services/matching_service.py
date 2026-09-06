from sqlalchemy.orm import Session
from app.models.user import User
from app.models.skill import Skill, SkillType
from app.crud.crud_skill import get_skills_for_user
from app.schemas.match import MatchResult, MatchListResponse
from app.schemas.skill import SkillOut
from app.schemas.user import UserPublic


def _score_label(score: int) -> str:
    if score >= 70:
        return "Excellent Match"
    if score >= 40:
        return "Good Match"
    return "Low Match"


def _calculate_score(my_skills: list[Skill], their_skills: list[Skill]) -> int:
    my_teach  = {s.name.lower() for s in my_skills   if s.type == SkillType.teach}
    my_learn  = {s.name.lower() for s in my_skills   if s.type == SkillType.learn}
    their_teach = {s.name.lower() for s in their_skills if s.type == SkillType.teach}
    their_learn = {s.name.lower() for s in their_skills if s.type == SkillType.learn}

    score = 0

    # +40: I teach what they want to learn
    if my_teach & their_learn:
        score += 40

    # +40: They teach what I want to learn
    if their_teach & my_learn:
        score += 40

    # +20: Common interests (any overlap across all skills)
    all_mine   = my_teach | my_learn
    all_theirs = their_teach | their_learn
    if all_mine & all_theirs:
        score += 20

    return min(score, 100)


def generate_matches(
    db: Session,
    current_user: User,
    all_users: list[User],
) -> MatchListResponse:
    my_skills = get_skills_for_user(db, current_user.id)

    results: list[MatchResult] = []
    for user in all_users:
        if user.id == current_user.id:
            continue

        their_skills = get_skills_for_user(db, user.id)
        if not their_skills:
            continue

        score = _calculate_score(my_skills, their_skills)
        if score == 0:
            continue

        teach_out = [SkillOut.model_validate(s) for s in their_skills if s.type == SkillType.teach]
        learn_out = [SkillOut.model_validate(s) for s in their_skills if s.type == SkillType.learn]

        results.append(
            MatchResult(
                user=UserPublic.model_validate(user),
                score=score,
                label=_score_label(score),
                teach_skills=teach_out,
                learn_skills=learn_out,
            )
        )

    results.sort(key=lambda r: r.score, reverse=True)
    return MatchListResponse(total=len(results), matches=results)
