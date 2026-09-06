from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.routers.dependencies import get_current_user
from app.models.user import User
from app.schemas.skill import SkillCreate, SkillUpdate, SkillOut
from app.crud.crud_skill import (
    create_skill, get_all_skills, get_skill_by_id, update_skill, delete_skill,
    get_skills_for_user,
)

router = APIRouter(prefix="/skills", tags=["Skills"])


@router.post("", response_model=SkillOut, status_code=201, summary="Add a skill")
def add_skill(
    data: SkillCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_skill(db, current_user.id, data)


@router.get("", response_model=list[SkillOut], summary="List my skills")
def list_my_skills(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_skills_for_user(db, current_user.id)


@router.put("/{skill_id}", response_model=SkillOut, summary="Update a skill")
def edit_skill(
    skill_id: int,
    data: SkillUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    skill = get_skill_by_id(db, skill_id)
    if not skill or skill.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found.")
    return update_skill(db, skill, data)


@router.delete("/{skill_id}", status_code=204, summary="Delete a skill")
def remove_skill(
    skill_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    skill = get_skill_by_id(db, skill_id)
    if not skill or skill.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found.")
    delete_skill(db, skill)
