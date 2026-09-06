from sqlalchemy.orm import Session
from sqlalchemy import select, func
from fastapi import HTTPException, status
from app.models.skill import Skill, SkillType
from app.schemas.skill import SkillCreate, SkillUpdate

MAX_SKILLS_PER_TYPE = 5


def _count_skills(db: Session, user_id: int, skill_type: SkillType) -> int:
    stmt = select(func.count()).select_from(Skill).where(
        Skill.user_id == user_id, Skill.type == skill_type
    )
    return db.scalar(stmt) or 0


def get_skill_by_id(db: Session, skill_id: int) -> Skill | None:
    return db.get(Skill, skill_id)


def get_skills_for_user(db: Session, user_id: int) -> list[Skill]:
    stmt = select(Skill).where(Skill.user_id == user_id)
    return list(db.scalars(stmt).all())


def get_all_skills(db: Session, skip: int = 0, limit: int = 200) -> list[Skill]:
    stmt = select(Skill).offset(skip).limit(limit)
    return list(db.scalars(stmt).all())


def create_skill(db: Session, user_id: int, data: SkillCreate) -> Skill:
    # Enforce max 5 per type
    count = _count_skills(db, user_id, data.type)
    if count >= MAX_SKILLS_PER_TYPE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {MAX_SKILLS_PER_TYPE} '{data.type}' skills allowed.",
        )

    # Prevent duplicates (same name + type for this user)
    existing = db.scalar(
        select(Skill).where(
            Skill.user_id == user_id,
            Skill.name == data.name.strip(),
            Skill.type == data.type,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have this skill listed.",
        )

    skill = Skill(
        user_id=user_id,
        name=data.name.strip(),
        type=data.type,
        category=data.category,
    )
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return skill


def update_skill(db: Session, skill: Skill, data: SkillUpdate) -> Skill:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(skill, field, value)
    db.commit()
    db.refresh(skill)
    return skill


def delete_skill(db: Session, skill: Skill) -> None:
    db.delete(skill)
    db.commit()
